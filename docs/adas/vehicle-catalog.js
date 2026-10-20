export const vehicleCatalog=Object.freeze([
 {id:'x6',name:'BMW X6',label:'宝马 X6',author:'vecarz (heynic)',source:'https://sketchfab.com/3d-models/bmw-x6m-competition-assetto-wwwvecarzcom-3979a908081948e0971f5a5380b60a0f'},
 {id:'model-3',name:'Tesla Model 3',label:'特斯拉 Model 3',author:'RBLXSupercars',source:'https://sketchfab.com/3d-models/2024-tesla-model-3-fd22be415215453693d67e33aa7812d0'},
 {id:'ix',name:'BMW iX',label:'宝马 iX',author:'DisneyCars (supercarmodels)',source:'https://sketchfab.com/3d-models/2024-bmw-ix-b277d6b6109845ffb3cc5de325e71948'},
 {id:'xc90',name:'Volvo XC90',label:'沃尔沃 XC90',author:'Nieve5677',source:'https://sketchfab.com/3d-models/volvo-xc90-8135a6c9c9344079bfaefc9d747e2ceb'}
]);
export function vehicleSpec(id){return vehicleCatalog.find(model=>model.id===id)||vehicleCatalog[0];}
export function vehicleReadme(readme,id){
 const model=vehicleSpec(id);
 return readme.replace(/Vehicle: BMW[^\n]+/,`车辆：${model.label}（${model.name}），作者：${model.author}。模型元数据声明采用 CC BY 4.0 许可。已调整白色车漆、玻璃、车灯、朝向、比例及用于网页交付的几何结构。\n模型来源：${model.source}\n车辆资源库：vehicle-library/README.md`);
}
