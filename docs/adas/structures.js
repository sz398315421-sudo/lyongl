// Navigation describes geometry. Environment options never select another camera.
export const structures=[
 {key:'road',name:'普通道路',group:'open',layouts:[['02','直行道路'],['09','双车道']],buildings:true,waterfront:true,trees:true,roadworks:true},
 {key:'elevated',name:'高架道路',group:'open',layouts:[['03','高架']],buildings:true,trees:true},
 {key:'junction',name:'交叉路口',group:'open',layouts:[['05','十字路口'],['08','丁字路口']],buildings:true,trees:true},
 {key:'ramp',name:'匝道',group:'open',layouts:[['06','驶出'],['07','并入']]},
 {key:'parking',name:'室内停车场',group:'closed',layouts:[['10','通道视角'],['14','俯视'],['16','抬高视角']]},
 {key:'outdoor',name:'室外停车场',group:'closed',layouts:[['17','默认'],['18','抬高'],['19','俯视']],buildings:true,trees:true}
];
export const legacyScenes={'01':'02','04':'09','12':'02','13':'02','15':'10','11':'09'};