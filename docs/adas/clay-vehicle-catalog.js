export const clayVehicleCatalog=Object.freeze([
 {id:'sedan',name:'Clay Sedan',label:'灰白轿车',length:4.5,triangles:2954},
 {id:'hatchback',name:'Clay Hatchback',label:'灰白两厢车',length:4.15,triangles:3124},
 {id:'suv',name:'Clay SUV',label:'灰白 SUV',length:4.75,triangles:3294}
].map(model=>Object.freeze({...model,author:'Quaternius',license:'CC0 1.0',source:'https://quaternius.com/packs/cars.html'})));
