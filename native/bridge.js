'use strict';
// 保留原系统的页面与样式，只转换原 HTTP 数据接口与 Tauri 命令。
window.Lingjing = (()=>{
  const core=window.__TAURI__?.core;
  const call=(name,args)=>core?core.invoke(name,args).catch(error=>{throw new Error(typeof error==='string'?error:error?.message||'操作失败')}):Promise.reject(new Error('请使用桌面客户端导入或播放本地音乐'));
  let library={roots:[],songs:[],warnings:[]},server={host:'',port:5000,https:false,account:''},connected=false;
  const id=path=>'s'+btoa(unescape(encodeURIComponent(path))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const track=s=>({...s,id:id(s.path),key:id(s.path)+':0',ep:0,albumArtist:s.artist,ext:'.'+s.path.split('.').pop().toLowerCase(),art:s.cover?(s.cover.startsWith('http')?s.cover:core?.convertFileSrc(s.cover)||''):'',dir:s.path.replace(/[/\\][^/\\]+$/,''),mtime:0,size:0,acodec:''});
  const onlineTracks = new Map();
  const tracks=()=>library.songs.map(track);
  const items=()=>tracks().map(s=>({id:s.id,title:s.title,type:'music',kind:'song',artist:s.artist,episodeCount:1,episodes:[{index:0,name:s.title,path:s.path,ext:s.ext,artist:s.artist,songTitle:s.title}],art:s.art,poster:'',meta:{},progress:null}));
  const sources=()=>library.roots.map(p=>({id:p,path:p.replace(/^nas:/,''),name:p.split(/[/\\]/).pop()||p,provider:p.startsWith('nas:')?'nas':'local',type:'music'}));
  async function reload(){if(core)library=await call('get_library');return library}
  function music(){const songs=tracks(),artistMap=new Map(),albumMap=new Map();for(const s of songs){if(!artistMap.has(s.artist))artistMap.set(s.artist,{name:s.artist,count:0,keys:[],albumCount:0,art:s.art});const a=artistMap.get(s.artist);a.count++;a.keys.push(s.key);if(s.album){const key=s.album+'|'+s.artist;if(!albumMap.has(key))albumMap.set(key,{key,name:s.album,artist:s.artist,count:0,duration:0,keys:[],art:s.art,itemId:s.id});const al=albumMap.get(key);al.count++;al.duration+=s.duration;al.keys.push(s.key)}}const artists=[...artistMap.values()],albums=[...albumMap.values()];for(const a of artists)a.albumCount=albums.filter(x=>x.artist===a.name).length;return {ok:true,songs,artists,albums,stats:{songs:songs.length,artists:artists.length,albums:albums.length,duration:songs.reduce((n,s)=>n+s.duration,0)},probing:0}}
  const lrc=raw=>{
    const decoded=String(raw||'').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,v)=>{const n=v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v);return n<=0x10ffff?String.fromCodePoint(n):''}).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    const offset=Number(/\[offset:\s*([+-]?\d+)\]/i.exec(decoded)?.[1]||0)/1000;
    return decoded.split(/\r?\n/).flatMap(line=>{
      const text=line.replace(/\[[^\]]*\]/g,'').trim();
      return [...line.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)].map(m=>({t:Math.max(0,Number(m[1])*60+Number(m[2])+(m[3]?Number('0.'+m[3]):0)+offset),text}));
    }).filter(line=>line.text&&!/^(纯音乐，请欣赏|暂无歌词)/.test(line.text)).sort((a,b)=>a.t-b.t);
  };
  function mvSessionProof(value, key) {
    let digits = [...key].map(char => char.charCodeAt(0)).join('');
    const stride = Math.floor(digits.length / 5);
    const multiplier = parseInt([1,2,3,4,5].map(n => digits.charAt(n * stride)).join(''), 10);
    const increment = Math.ceil(key.length / 2), modulus = 2147483647;
    const salt = Math.round(Math.random() * 1e9) % 1e8;
    digits += salt;
    while (digits.length > 10) digits = (parseInt(digits.substring(0,10),10) + parseInt(digits.substring(10),10)).toString();
    let state = (multiplier * digits + increment) % modulus;
    let result = '';
    for (const char of value) {
      result += (char.charCodeAt(0) ^ Math.floor(state / modulus * 255)).toString(16).padStart(2,'0');
      state = (multiplier * state + increment) % modulus;
    }
    return result + salt.toString(16).padStart(8,'0');
  }
  async function request(path,opts={}){
    const u=new URL(path,location.href),body=opts.body?JSON.parse(opts.body):{};
    switch(u.pathname){
      case '/api/state': await reload();return {ok:true,version:'0.1.0',connected,needLogin:false,server,hostname:server.host,sources:sources(),counts:{music:library.songs.length},total:library.songs.length,scanning:false,enriching:false,libraryReady:true,hasFfmpeg:false,hasTmdb:false,transcode:false};
      case '/api/library':{const all=items();return {ok:true,total:all.length,rows:[{id:'music',items:all}],lists:{music:all},featured:[]}}
      case '/api/music':return music();
      case '/api/music/match':return {ok:true,...await call('match_songs',{title:body.title||'',artist:body.artist||'',duration:Number(body.duration)||0})};
      case '/api/play':{const s=onlineTracks.get(u.searchParams.get('item'))||tracks().find(s=>s.id===u.searchParams.get('item'));if(!s)throw new Error('歌曲不存在，请重新扫描音乐目录');if(s.video){const session=await call('online_mv_prepare',{path:s.onlinePath});const split=session.cookie.indexOf('=');const secret=mvSessionProof(session.cookie.slice(split+1),session.cookie.slice(0,split));const resolved=await call('online_mv_resolve',{mid:session.mid,cookie:session.cookie,secret});s.stream=resolved.url;}else if(s.onlineSource){const resolved=await call('online_play',{source:s.onlineSource,path:s.onlinePath});s.stream=resolved.localPath?core.convertFileSrc(resolved.localPath):resolved.url;s.art=resolved.cover||'';s.lyrics=resolved.lyrics||'';}const url=s.stream|| (s.path.startsWith('nas:')?core.convertFileSrc('/stream','nas')+'?path='+encodeURIComponent(s.path.slice(4)):core.convertFileSrc(s.path));return {ok:true,itemId:s.id,epIndex:0,title:s.title,episodeTitle:s.title,episodeArtist:s.artist,artist:s.artist,kind:s.video?'movie':'song',type:s.video?'video':'music',audio:!s.video,song:s,mode:'direct',playable:true,url,urls:{direct:url},seekable:true,duration:s.duration,art:s.art,poster:s.art,playlist:{current:0,items:[{itemId:s.id,epIndex:0,title:s.title,artist:s.artist}]},audioTracks:[],subtitleTracks:[],episodes:s.video?[{index:0,name:s.title,title:s.title}]:[],totalEpisodes:1}}
      case '/api/lyrics': {
        const song=onlineTracks.get(u.searchParams.get('item'))||tracks().find(s=>s.id===u.searchParams.get('item'));
        if(!song)throw new Error('歌曲不存在，请重新选择歌曲');
        const query=u.searchParams.get('q')||'',refresh=u.searchParams.get('refresh')==='1';
        if(!query&&!refresh){
          let raw=song.lyrics||'';
          if(!raw&&song.path&&!song.path.startsWith('nas:')){try{raw=await call('lyrics',{path:song.path})}catch(_){}}
          const lines=lrc(raw);
          if(lines.length)return {ok:true,source:song.onlineSource?'在线歌词':'本地歌词',lines};
        }
        const result=await call('search_lyrics',{title:song.title||'',artist:song.artist||'',duration:Number(song.duration)||0,query,refresh});
        const lines=lrc(result.lrc||'');
        return {ok:lines.length>0,source:result.source||'',lines};
      }
      case '/api/item':{const item=items().find(s=>s.id===u.searchParams.get('id'));if(!item)throw new Error('歌曲不存在');return {ok:true,item,meta:item.meta||{},episodes:item.episodes||[],progress:item.progress||null,similar:[]}}
      case '/api/music/metadata': {const path=opts.method==='POST'?body.itemId:u.searchParams.get('item');const s=tracks().find(s=>s.id===path);if(!s)throw new Error('歌曲不存在');if(opts.method!=='POST')return {ok:true,title:s.title,artist:s.artist,album:s.album,cover:s.cover||''};await call('edit_metadata',{path:s.path,title:body.title,artist:body.artist,album:body.album,cover:body.cover||''});await reload();return {ok:true,song:tracks().find(t=>t.id===path)}}
      case '/api/progress':return {ok:true};
      case '/api/scan':library=await call('rescan');return {ok:true};
      case '/api/scan/status':return {ok:true,scanning:false,enriching:false};
      case '/api/login':{const host=body.host.replace(/^https?:\/\//,'').replace(/\/$/,'');server={host,port:body.port||(body.https?5001:5000),https:body.https===true,account:body.account};await call('connect_nas',{base:`${server.https?'https':'http'}://${host}:${server.port}`,account:body.account,password:body.password,otp:body.otp||''});connected=true;return {ok:true,hostname:server.host}}
      case '/api/logout':await call('disconnect_nas');connected=false;return {ok:true};
      case '/api/browse':return call('browse_nas',{path:u.searchParams.get('path')||''});
      case '/api/sources':if(opts.method==='DELETE'){library=await call('remove_source',{path:u.searchParams.get('id')});return {ok:true}}if(opts.method==='PUT')return {ok:true};library=await call('import_nas',{path:body.path});return {ok:true};
      case '/api/discover':return call('discover_nas');
      default:throw new Error('此功能尚未迁移到轻量桌面版');
    }
  }
  return {request,registerOnline:s=>onlineTracks.set(s.id,s),cacheCover:url=>call('cache_cover',{url}),imageURL:url=>url?(/^(asset:|https?:)/.test(url)?url:core?.convertFileSrc(url)||''):'',confirm:message=>call('confirm_action',{message}),importFolder:async()=>{const result=await call('import_folder');if(result)library=result;return result},parseLrc:lrc};
})();
