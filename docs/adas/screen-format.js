export const screenFormats=Object.freeze([
 Object.freeze({id:'16:9',label:'1920 × 1080',width:1920,height:1080}),
 Object.freeze({id:'21:9',label:'2560 × 1080',width:2560,height:1080}),
 Object.freeze({id:'1920x720',label:'1920 × 720',width:1920,height:720})
]);

export function screenFormat(id){return screenFormats.find(format=>format.id===id)||screenFormats[0];}
// Shared by preview and every export format. Changes are blocked during export.
export const exportSize={width:1920,height:1080};
export function setScreenFormat(id){const format=screenFormat(id);Object.assign(exportSize,{width:format.width,height:format.height});return format;}
export function sizeLabel(){return `${exportSize.width} × ${exportSize.height}`;}
