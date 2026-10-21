function shuffle(items,random){
 const result=[...items];
 for(let i=result.length-1;i>0;i--){const j=Math.min(i,Math.floor(random()*(i+1)));[result[i],result[j]]=[result[j],result[i]];}
 return result;
}

export function isParkingModelAllowed(id){return id!=='911-gt3-r';}

export function chooseParkingModels(ids,egoId,count=3,random=Math.random){
 return shuffle([...new Set(ids)].filter(id=>id!==egoId&&isParkingModelAllowed(id)),random).slice(0,count);
}

export function assignParkingModels(ids,count=7,random=Math.random){
 ids=ids.filter(isParkingModelAllowed);
 if(!ids.length)return [];
 const assignments=[];
 while(assignments.length<count)assignments.push(...shuffle(ids,random));
 return assignments.slice(0,count);
}

// Retain selected source models independently of the currently displayed scene.
// Scene groups also hold their own references until replacement or cache eviction.
export function createParkingVehiclePool({ids,load,retain,count=3,random=Math.random}){
 let current=null,pending=null,revision=0;
 return {
  get current(){return current;},
  ready(egoId){return current?.egoId===egoId;},
  ensure(egoId){
   if(current?.egoId===egoId){if(pending&&pending.egoId!==egoId){revision++;pending=null;}return Promise.resolve(current);}
   if(pending?.egoId===egoId)return pending.promise;
   const version=++revision,releases=[];
   const candidates=chooseParkingModels(ids,egoId,ids.length,random);
   const promise=Promise.resolve().then(async()=>{
    const models=[];
    try{
     // Retry a failed selection with another eligible library model.
     for(let start=0;start<candidates.length&&models.length<count;){
      const batch=candidates.slice(start,start+count-models.length);start+=batch.length;
      const results=await Promise.allSettled(batch.map(async id=>{
       const release=retain(id);releases.push(release);
       try{return {id,root:await load(id)};}catch(error){release();releases.splice(releases.indexOf(release),1);throw error;}
      }));
      if(version!==revision){releases.forEach(release=>release());return null;}
      for(const result of results)if(result.status==='fulfilled')models.push(result.value);
     }
     if(!models.length)throw Error('No nearby vehicle models could be loaded');
     const previous=current;
     current={egoId,models,assignment:assignParkingModels(models.map(model=>model.id),7,random),release:()=>releases.splice(0).forEach(release=>release())};
     previous?.release();return current;
    }catch(error){releases.splice(0).forEach(release=>release());throw error;}
    finally{if(pending?.version===version)pending=null;}
   });
   pending={egoId,version,promise};return promise;
  }
 };
}
