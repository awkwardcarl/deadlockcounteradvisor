'use strict';
/** Global show/hide hotkey, so the window can be brought up or put away from
 * in-game. Ctrl+Shift+F12 stays clear of Deadlock's movement keys (Ctrl crouch,
 * Shift dash, Space jump, WASD) and of Ctrl+Alt letters, which some keyboard
 * layouts use to type characters. */
const SHOW_HIDE_ACCELERATOR='CommandOrControl+Shift+F12';
const SHOW_HIDE_LABEL='Ctrl+Shift+F12';

// The game usually has focus when the hotkey is pressed, so showing must not
// take focus: activating this window could minimize a fullscreen game.
function toggleWindow(win){
  if(!win||win.isDestroyed())return 'none';
  if(win.isVisible()&&!win.isMinimized()){win.minimize();return 'hidden';}
  win.showInactive();
  win.moveTop();
  return 'shown';
}
function registerShowHideHotkey(globalShortcut,getWindow){
  try{return globalShortcut.register(SHOW_HIDE_ACCELERATOR,()=>toggleWindow(getWindow()))===true;}
  catch(_){return false;}
}
module.exports={SHOW_HIDE_ACCELERATOR,SHOW_HIDE_LABEL,toggleWindow,registerShowHideHotkey};
