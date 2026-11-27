export function turnDirection({rampExit,parkingExit,laneChange}){
 if(rampExit||parkingExit===1)return 'right';
 if(parkingExit===-1)return 'left';
 return laneChange?.direction==='left'||laneChange?.direction==='right'?laneChange.direction:null;
}

export const turnSignalBeat=elapsedMs=>Math.floor(elapsedMs/430);

export function mountTurnSignal(container,initialMuted,onMute){
 const button=document.createElement('button');
 button.type='button';button.className='studio-signal';button.hidden=true;
 let muted=initialMuted,audio,beat=-1;
 function unlock(){
  if(muted)return;
  try{
   const Audio=window.AudioContext||window.webkitAudioContext;
   if(!Audio)return;
   audio??=new Audio();
   if(audio.state!=='running')audio.resume().catch(()=>{});
  }catch{}
 }
 function tick(pulse){
  if(!audio||audio.state!=='running')return;
  const time=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();
  osc.type='triangle';
  osc.frequency.setValueAtTime(pulse%2?410:640,time);
  osc.frequency.exponentialRampToValueAtTime(240,time+.045);
  gain.gain.setValueAtTime(.085,time);
  gain.gain.exponentialRampToValueAtTime(.0001,time+.055);
  osc.connect(gain);gain.connect(audio.destination);
  osc.onended=()=>{osc.disconnect();gain.disconnect();};
  osc.start(time);osc.stop(time+.06);
 }
 button.addEventListener('click',()=>{muted=!muted;onMute(muted);updateButton();if(!muted)unlock();});
 function updateButton(){
  button.textContent=muted?'转向提示音已关闭':'转向提示音';
  button.setAttribute('aria-pressed',String(!muted));
 }
 updateButton();container.append(button);
 return {unlock,sync(snapshot,exporting){
  const turning=!!turnDirection(snapshot);
  button.hidden=!turning||snapshot.status==='finished';
  button.disabled=exporting;
  if(exporting||!turning||snapshot.status!=='playing'){beat=-1;return;}
  const pulse=turnSignalBeat(snapshot.elapsedMs);
  if(pulse!==beat){beat=pulse;if(!muted)tick(pulse);}
 }};
}
