import {createParkingVehiclePool} from './parking-vehicle-pool.js';
import {clayVehicleCatalog} from './clay-vehicle-catalog.js';
import {loadClayModels} from './traffic-clay-models.js';

// These three small shared templates live for the application lifetime.
export function createClayParkingVehiclePool({load=loadClayModels,random=Math.random}={}){
 let models;
 function templates(){
  if(!models)models=Promise.resolve().then(load).catch(error=>{models=null;throw error;});
  return models;
 }
 return createParkingVehiclePool({ids:clayVehicleCatalog.map(model=>model.id),count:3,random,
  load:async id=>{
   const model=(await templates()).find(model=>model.id===id);
   if(!model)throw Error(`Missing clay parking model: ${id}`);
   return model.root;
  },retain:()=>()=>{}
 });
}
