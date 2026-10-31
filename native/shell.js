'use strict';
document.addEventListener('click', async event => {
  const navigation = event.target.closest('[data-shell-history]');
  if (navigation) { if (navigation.dataset.shellHistory === 'back') history.back(); else history.forward(); return; }
  const section = event.target.closest('[data-shell-view]');
  if (!section) return;
  const view = section.dataset.shellView;
  if (AU.open) hideAudioPage();
  MUSIC.tab = ['song', 'artist', 'album'].includes(view) ? view : 'song';
  MUSIC.favoriteOnly = view === 'favorites';
  MUSIC.localOnly = view === 'local';
  MUSIC.sourcePath = view === 'source' ? section.dataset.path || '' : '';
  MUSIC.artist = MUSIC.album = 'all';
  MUSIC.q = '';
  if (state.route.name === 'list' && state.route.type === 'music') {
    await fetchMusic();
    paintMusic();
    renderSidebar();
    syncTopbarSearch();
    $('#main').scrollTop = 0;
  } else { MUSIC.shellNavigation = true; go('#/list/music'); }
});
