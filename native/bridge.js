'use strict';
// 保留原系统的页面与样式，只转换原 HTTP 数据接口与 Tauri 命令。
window.Lingjing = (()=>{
  const core=window.__TAURI__?.core;
  const call=(name,args)=>core?core.invoke(name,args).catch(error=>{throw new Error(typeof error==='string'?error:error?.message||'操作失败')}):Promise.reject(new Error('请使用桌面客户端导入或播放本地音乐'));
  let library={roots:[],songs:[],warnings:[]},server={host:'',port:5001,https:true,account:''},connected=false;
  const id=path=>'s'+btoa(unescape(encodeURIComponent(path))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const track=s=>({...s,id:id(s.path),key:id(s.path)+':0',ep:0,albumArtist:s.artist,ext:'.'+s.path.split('.').pop().toLowerCase(),art:s.cover?(s.cover.startsWith('http')?s.cover:core?.convertFileSrc(s.cover)||''):'',dir:s.path.replace(/[/\\][^/\\]+$/,''),mtime:0,size:0,acodec:''});
  const tracks=()=>library.songs.map(track);
  const items=()=>tracks().map(s=>({id:s.id,title:s.title,type:'music',kind:'song',artist:s.artist,episodeCount:1,episodes:[{index:0,name:s.title,path:s.path,ext:s.ext,artist:s.artist,songTitle:s.title}],art:'',poster:'',meta:{},progress:null}));
  const sources=()=>library.roots.map(p=>({id:p,path:p.replace(/^nas:/,''),name:p.split(/[/\\]/).pop()||p,provider:p.startsWith('nas:')?'nas':'local',type:'music'}));
  async function reload(){if(core)library=await call('get_library');return library}
  function music(){const songs=tracks(),artistMap=new Map(),albumMap=new Map();for(const s of songs){if(!artistMap.has(s.artist))artistMap.set(s.artist,{name:s.artist,count:0,keys:[],albumCount:0,art:s.art});const a=artistMap.get(s.artist);a.count++;a.keys.push(s.key);if(s.album){const key=s.album+'|'+s.artist;if(!albumMap.has(key))albumMap.set(key,{key,name:s.album,artist:s.artist,count:0,duration:0,keys:[],art:s.art,itemId:s.id});const al=albumMap.get(key);al.count++;al.duration+=s.duration;al.keys.push(s.key)}}const artists=[...artistMap.values()],albums=[...albumMap.values()];for(const a of artists)a.albumCount=albums.filter(x=>x.artist===a.name).length;return {ok:true,songs,artists,albums,stats:{songs:songs.length,artists:artists.length,albums:albums.length,duration:songs.reduce((n,s)=>n+s.duration,0)},probing:0}}
  const lrc=text=>text.split(/\r?\n/).flatMap(line=>{const text=line.replace(/\[\d+:\d+(?:\.\d+)?\]/g,'').trim();return [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)].map(m=>({t:Number(m[1])*60+Number(m[2]),text}))}).sort((a,b)=>a.t-b.t);
  async function request(path,opts={}){
    const u=new URL(path,location.href),body=opts.body?JSON.parse(opts.body):{};
    switch(u.pathname){
      case '/api/state': await reload();return {ok:true,version:'0.1.0',connected,needLogin:false,server,hostname:server.host,sources:sources(),counts:{music:library.songs.length},total:library.songs.length,scanning:false,enriching:false,libraryReady:true,hasFfmpeg:false,hasTmdb:false,transcode:false};
      case '/api/library':{const all=items();return {ok:true,total:all.length,rows:[{id:'music',items:all}],lists:{music:all},featured:[]}}
      case '/api/music':return music();
      case '/api/music/match':return {ok:true,...await call('match_songs',{title:body.title||'',artist:body.artist||'',duration:Number(body.duration)||0})};
      case '/api/play':{const s=tracks().find(s=>s.id===u.searchParams.get('item'));if(!s)throw new Error('歌曲不存在，请重新扫描音乐目录');const url=s.path.startsWith('nas:')?core.convertFileSrc('/stream','nas')+'?path='+encodeURIComponent(s.path.slice(4)):core.convertFileSrc(s.path);return {ok:true,itemId:s.id,epIndex:0,title:s.title,episodeTitle:s.title,episodeArtist:s.artist,artist:s.artist,kind:'song',type:'music',audio:true,song:s,mode:'direct',playable:true,url,urls:{direct:url},seekable:true,duration:s.duration,art:s.art,poster:s.art,playlist:{current:0,items:[{itemId:s.id,epIndex:0,title:s.title,artist:s.artist}]},audioTracks:[],subtitleTracks:[],episodes:[],totalEpisodes:1}}
      case '/api/lyrics':{const s=tracks().find(s=>s.id===u.searchParams.get('item'));const text=s&&!s.path.startsWith('nas:')?await call('lyrics',{path:s.path}):'';return {ok:!!text,source:'本地歌词',lines:lrc(text)}}
      case '/api/item':{const item=items().find(s=>s.id===u.searchParams.get('id'));if(!item)throw new Error('歌曲不存在');return {ok:true,...item}}
      case '/api/music/metadata': {const path=opts.method==='POST'?body.itemId:u.searchParams.get('item');const s=tracks().find(s=>s.id===path);if(!s)throw new Error('歌曲不存在');if(opts.method!=='POST')return {ok:true,title:s.title,artist:s.artist,album:s.album,cover:s.cover||''};await call('edit_metadata',{path:s.path,title:body.title,artist:body.artist,album:body.album,cover:body.cover||''});await reload();return {ok:true,song:tracks().find(t=>t.id===path)}}
      case '/api/progress':return {ok:true};
      case '/api/scan':library=await call('rescan');return {ok:true};
      case '/api/scan/status':return {ok:true,scanning:false,enriching:false};
      case '/api/login':{const host=body.host.replace(/^https?:\/\//,'').replace(/\/$/,'');server={host,port:body.port||5001,https:body.https!==false,account:body.account};await call('connect_nas',{base:`${server.https?'https':'http'}://${host}:${server.port}`,account:body.account,password:body.password,otp:body.otp||''});connected=true;return {ok:true,hostname:server.host}}
      case '/api/logout':await call('disconnect_nas');connected=false;return {ok:true};
      case '/api/browse':return call('browse_nas',{path:u.searchParams.get('path')||''});
      case '/api/sources':if(opts.method==='DELETE'){library=await call('remove_source',{path:u.searchParams.get('id')});return {ok:true}}if(opts.method==='PUT')return {ok:true};library=await call('import_nas',{path:body.path});return {ok:true};
      case '/api/discover':return {ok:true,hosts:[],localIps:[]};
      default:throw new Error('此功能尚未迁移到轻量桌面版');
    }
  }
  return {request,cacheCover:url=>call('cache_cover',{url}),imageURL:url=>url?(/^(asset:|http:\/\/asset.localhost)/.test(url)?url:core?.convertFileSrc(url)||''):'',confirm:message=>call('confirm_action',{message}),importFolder:async()=>{const result=await call('import_folder');if(result)library=result;return result},parseLrc:lrc};
})();
