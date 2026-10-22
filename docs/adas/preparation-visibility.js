// Warm authored environment elements, but never wake a disabled vehicle group.
// Invisible parts inside the ego model keep their own authored visibility.
export function revealForPreparation(root,excluded=null){
 const previous=[];
 function visit(object){
  if(object===excluded)return;
  previous.push([object,object.visible,object.frustumCulled]);object.visible=true;object.frustumCulled=false;
  for(const child of object.children)visit(child);
 }
 visit(root);
 return ()=>{for(const [object,visible,culled]of previous){object.visible=visible;object.frustumCulled=culled;}};
}
