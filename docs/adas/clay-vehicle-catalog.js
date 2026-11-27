export const clayVehicleCatalog=Object.freeze([
 {id:'sedan',name:'Clay Sedan',label:'灰白轿车',length:4.65},
 {id:'hatchback',name:'Clay Crossover',label:'灰白跨界车',length:4.5},
 {id:'suv',name:'Clay SUV',label:'灰白 SUV',length:4.72}
].map(model=>Object.freeze({...model,author:'本项目',procedural:true})));
