const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(options={}){let library={roots:['/音乐'],warnings:[],songs:[{path:'/音乐/中文 & test.flac',title:'测试',artist:'歌手',album:'专辑',duration:120}]};const calls=[];const context={window:{__TAURI__:{core:{invoke:async(name,args)=>{calls.push([name,args]);if(name==='get_library'||name==='import_folder')return library;if(name==='lyrics')return options.localLyrics??'[00:01.00]第一行\n[00:02.50][00:04.00]第二行';if(name==='search_lyrics')return {ok:true,source:'netease',lrc:'[00:01.20]联网歌词'};if(name==='connect_nas')return null;if(name==='online_mv_prepare')return {mid:'661461106',cookie:'session_key=public_session'};if(name==='online_mv_resolve')return {url:'https://media.example.test/mv.mp4'};if(name==='online_play')return {localPath:'/cache/online-audio/test.mp3'};if(name==='match_songs')return {results:[{title:'晴天',artist:'周杰伦',album:'叶惠美',cover:'https://y.gtimg.cn/cover.jpg'}],warnings:[]};if(name==='cache_cover')return '/cache/covers/test.jpg';if(name==='edit_metadata'){library.songs=library.songs.map(s=>s.path===args.path?{...s,title:args.title,artist:args.artist,album:args.album,cover:args.cover}:s);return null;}throw new Error(name)},convertFileSrc:p=>'asset://'+encodeURIComponent(p)}}},URL,location:{href:'http://tauri.localhost/'},btoa:s=>Buffer.from(s,'binary').toString('base64'),unescape,encodeURIComponent};vm.createContext(context);vm.runInContext(fs.readFileSync('native/bridge.js','utf8'),context);return {bridge:context.window.Lingjing,calls,setLibrary:x=>library=x}}
test('中文目录与歌曲通过稳定标识连接原音乐列表和播放器',async()=>{const {bridge}=setup();await bridge.request('/api/state');const music=await bridge.request('/api/music');assert.equal(music.stats.songs,1);assert.equal(music.artists[0].name,'歌手');const song=music.songs[0];assert.doesNotMatch(song.id,/[+/=]/);const play=await bridge.request('/api/play?item='+song.id);assert.equal(play.song.path,'/音乐/中文 & test.flac');assert.equal(play.audio,true);assert.equal(play.mode,'direct');assert.equal(play.itemId,song.id);assert.equal(play.duration,120);assert.match(play.url,/asset:/)});
test('原系统歌词结构接收多时间戳 LRC',async()=>{const {bridge}=setup();await bridge.request('/api/state');const song=(await bridge.request('/api/music')).songs[0];const result=await bridge.request('/api/lyrics?item='+song.id);assert.equal(result.lines.length,3);assert.equal(result.lines[1].t,2.5);assert.equal(result.lines[2].text,'第二行')});
test('不同歌手的同名专辑保持分开',async()=>{const {bridge,setLibrary}=setup();setLibrary({roots:[],songs:[{path:'/a.mp3',title:'A',artist:'甲',album:'精选',duration:1},{path:'/b.mp3',title:'B',artist:'乙',album:'精选',duration:2}]});await bridge.request('/api/state');const result=await bridge.request('/api/music');assert.equal(result.albums.length,2);assert.equal(result.stats.duration,3)});
test('导入使用原生文件夹选择命令',async()=>{const {bridge,calls}=setup();await bridge.importFolder();assert.equal(calls[0][0],'import_folder');assert.equal((await bridge.request('/api/music')).songs.length,1)});
test('群晖歌曲使用独立流协议而非本地文件协议',async()=>{const {bridge,setLibrary}=setup();setLibrary({roots:['nas:/music'],songs:[{path:'nas:/music/a.mp3',title:'a',artist:'a',album:'a',duration:0}]});await bridge.request('/api/state');const song=(await bridge.request('/api/music')).songs[0];const result=await bridge.request('/api/play?item='+song.id);assert.match(result.url,/path=%2Fmusic%2Fa.mp3/);const source=(await bridge.request('/api/state')).sources[0];assert.equal(source.provider,'nas');assert.equal(source.path,'/music')});
test('音乐馆样式与已有系统保持完全一致',()=>{for(const name of ['style.css','glass.css'])assert.equal(fs.readFileSync('native/'+name,'utf8'),fs.readFileSync('public/'+name,'utf8'))});

test('歌曲匹配候选、封面缓存和保存后播放信息贯通',async()=>{const {bridge,calls}=setup();await bridge.request('/api/state');const song=(await bridge.request('/api/music')).songs[0];const result=await bridge.request('/api/music/match',{method:'POST',body:JSON.stringify({title:'晴天',artist:'周杰伦',duration:269})});assert.equal(result.results[0].album,'叶惠美');const cover=await bridge.cacheCover(result.results[0].cover);const saved=await bridge.request('/api/music/metadata',{method:'POST',body:JSON.stringify({itemId:song.id,title:'晴天',artist:'周杰伦',album:'叶惠美',cover})});assert.equal(saved.song.id,song.id);assert.equal(saved.song.title,'晴天');assert.match(saved.song.art,/asset:/);const play=await bridge.request('/api/play?item='+song.id);assert.equal(play.song.artist,'周杰伦');const matchCall=calls.find(([cmd])=>cmd==='match_songs');assert.equal(matchCall[1].duration,269);assert.equal((await bridge.request('/api/music')).albums[0].art,saved.song.art)});

test('歌曲详情返回完整详情结构并能继续播放群晖歌曲',async()=>{
  const {bridge,setLibrary}=setup();
  setLibrary({roots:['nas:/music'],songs:[{path:'nas:/music/test.mp3',title:'测试歌曲',artist:'歌手',album:'专辑',duration:120}]});
  await bridge.request('/api/state');
  const song=(await bridge.request('/api/music')).songs[0];
  const detail=await bridge.request('/api/item?id='+song.id);
  assert.equal(detail.item.id,song.id);
  assert.equal(detail.item.title,'测试歌曲');
  assert.equal(detail.episodes[0].path,'nas:/music/test.mp3');
  assert.deepEqual(Array.from(detail.similar),[]);
  const play=await bridge.request('/api/play?item='+detail.item.id);
  assert.equal(play.playable,true);
  assert.match(play.url,/path=%2Fmusic%2Ftest.mp3/);
});

test('在线歌曲解析后通过本地媒体协议播放，不使用受限网页地址',async()=>{
 const {bridge,calls}=setup();
 bridge.registerOnline({id:'shiyinren:/song/1.html',title:'在线歌曲',artist:'歌手',path:'',duration:0,onlineSource:'shiyinren',onlinePath:'/song/1.html'});
 const play=await bridge.request('/api/play?item='+encodeURIComponent('shiyinren:/song/1.html'));
 assert.equal(play.playable,true);
 assert.equal(play.url,'asset://'+encodeURIComponent('/cache/online-audio/test.mp3'));
 assert.equal(calls[0][0],'online_play');
});

test('MV 使用现有视频播放器数据结构，保留音视频流和单集信息',async()=>{
 const {bridge,calls}=setup();
 bridge.registerOnline({id:'shiyinren:mv-test',title:'MV 测试',artist:'歌手',path:'',duration:0,onlineSource:'shiyinren',onlinePath:'/mv/192645.html',video:true});
 const play=await bridge.request('/api/play?item='+encodeURIComponent('shiyinren:mv-test'));
 assert.equal(play.audio,false);
 assert.equal(play.kind,'movie');
 assert.equal(play.mode,'direct');
 assert.equal(play.episodes[0].title,'MV 测试');
 assert.equal(play.url,'https://media.example.test/mv.mp4');
 assert.equal(calls[1][0],'online_mv_resolve');
 assert.match(calls[1][1].secret,/^[0-9a-f]+$/);
});


test('本地歌词缺失时联网，重新匹配和手动关键词传递到歌词服务',async()=>{
 const {bridge,calls}=setup({localLyrics:''});await bridge.request('/api/state');
 const song=(await bridge.request('/api/music')).songs[0];
 const result=await bridge.request('/api/lyrics?item='+song.id);
 assert.equal(result.lines[0].text,'联网歌词');assert.equal(result.source,'netease');
 await bridge.request('/api/lyrics?item='+song.id+'&q='+encodeURIComponent('晴天 周杰伦')+'&refresh=1');
 const args=calls.filter(([name])=>name==='search_lyrics').at(-1)[1];
 assert.equal(args.query,'晴天 周杰伦');assert.equal(args.refresh,true);assert.equal(args.duration,120);
});
test('群晖和无自带歌词的在线歌曲均能联网匹配',async()=>{
 const {bridge,calls,setLibrary}=setup();
 setLibrary({roots:['nas:/music'],songs:[{path:'nas:/music/a.mp3',title:'放手',artist:'阿杜',duration:217}]});await bridge.request('/api/state');
 const song=(await bridge.request('/api/music')).songs[0];
 assert.equal((await bridge.request('/api/lyrics?item='+song.id)).lines[0].text,'联网歌词');
 assert.equal(calls.some(([name])=>name==='lyrics'),false);
 bridge.registerOnline({id:'online-1',title:'晴天',artist:'周杰伦',onlineSource:'shiyinren',lyrics:''});
 assert.equal((await bridge.request('/api/lyrics?item=online-1')).ok,true);
 assert.equal(calls.filter(([name])=>name==='search_lyrics').at(-1)[1].title,'晴天');
});
test('歌词兼容冒号毫秒、偏移、实体编码和多时间戳',()=>{
 const {bridge}=setup();const lines=bridge.parseLrc('[offset:-200]\n[00:01:50][00:03.500]你&#22909;&amp;我');
 assert.equal(lines[0].t,1.3);assert.equal(lines[1].t,3.3);assert.equal(lines[0].text,'你好&我');
});


test('侧栏选中项互斥：保留目录条件时切到在线、收藏、本地也不会重复高亮',()=>{
 const source=fs.readFileSync('native/app.js','utf8');
 const fn=source.slice(source.indexOf('function renderSidebar()'),source.indexOf('/* -------------------------------- 顶栏'));
 const sidebar={innerHTML:''};
 const context={state:{boot:{sources:[{id:'nas',path:'/music',provider:'nas',name:'音乐'}]},route:{name:'list',type:'music'},favorites:new Set()},MUSIC:{online:false,favoriteOnly:false,localOnly:false,sourcePath:'nas:/music',tab:'song'},localStorage:{getItem:()=>null},$:()=>sidebar,esc:String,icon:()=>'',currentTheme:()=> 'light',syncMusicPlayback(){},document:{documentElement:{classList:{contains:()=>false}}}};
 vm.createContext(context);vm.runInContext(fn,context);
 const selected=()=>{vm.runInContext('renderSidebar()',context);return [...sidebar.innerHTML.matchAll(/<button[^>]*class="[^"]*\bactive\b[^"]*"[^>]*>/g)].map(m=>/data-shell-view="([^"]+)"/.exec(m[0])?.[1]||'settings')};
 assert.deepEqual(selected(),['source']);
 context.MUSIC.online=true;assert.deepEqual(selected(),['online']);
 context.MUSIC.online=false;context.MUSIC.favoriteOnly=true;assert.deepEqual(selected(),['favorites']);
 context.MUSIC.favoriteOnly=false;context.MUSIC.localOnly=true;assert.deepEqual(selected(),['local']);
 context.MUSIC.localOnly=false;context.MUSIC.sourcePath='';context.MUSIC.tab='artist';assert.deepEqual(selected(),['artist']);
 context.state.route={name:'settings'};assert.deepEqual(selected(),['settings']);
});

test('当前专辑按歌手区分，同名专辑不会一起高亮',()=>{
 const src=fs.readFileSync('native/app.js','utf8');
 const fn=src.slice(src.indexOf('function syncMusicPlayback()'),src.indexOf('function syncAuPlayIcon()'));
 const cards=['阿杜','六哲'].map(artist=>({dataset:{name:'音乐',artist},classList:{contains:()=>false,toggle(name,on){this[name]=on}},setAttribute(){},removeAttribute(){}}));
 const ctx={AU:{data:{song:{album:'音乐',artist:'阿杜',id:'1'}},el:{paused:true}},MUSIC:{data:{songs:[]}},state:{favorites:new Set()},auIndexInfo:()=>({id:'1',key:'1:0'}),document:{querySelectorAll:s=>s==='.mart, .malb'?cards:[]}};
 vm.createContext(ctx);vm.runInContext(fn+';syncMusicPlayback()',ctx);
 assert.equal(cards[0].classList['is-current'],true);assert.equal(cards[1].classList['is-current'],false);
});
