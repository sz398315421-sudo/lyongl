// Settings are shared by the selector, URL and renderer.
export const defaultVehicleSettings=Object.freeze({paint:'original',material:'original',view:'scene',lighting:'scene',intensity:100});
export const paintOptions=[['original','原厂'],['#edf0f4','珍珠白'],['#222831','曜石黑'],['#9da8b5','铂光银'],['#184773','深海蓝'],['#a52232','赤焰红'],['#38675d','松石绿']];
export const materialOptions=[['original','原厂'],['gloss','亮面'],['metallic','金属'],['matte','哑光']];
export const viewOptions=[['scene','默认'],['rear','后侧'],['front','前侧'],['side','侧面'],['top','俯视']];
export const lightingOptions=[['scene','跟随场景'],['studio','柔光'],['warm','暖光'],['cool','冷光']];
export function normalizeVehicleSettings(value={}){
 const choice=(options,key)=>options.some(([id])=>id===value[key])?value[key]:defaultVehicleSettings[key];
 return {paint:/^#[\da-f]{6}$/i.test(value.paint||'')?value.paint.toLowerCase():'original',material:choice(materialOptions,'material'),view:choice(viewOptions,'view'),lighting:choice(lightingOptions,'lighting'),intensity:Number.isFinite(Number(value.intensity))&&value.intensity!==null?Math.min(150,Math.max(30,Math.round(Number(value.intensity)))):100};
}
export function readVehicleSettings(query){return normalizeVehicleSettings({paint:query.get('paint'),material:query.get('finish'),view:query.get('vehicleView'),lighting:query.get('lighting'),intensity:query.get('lightIntensity')});}
export function writeVehicleSettings(query,settings){for(const [key,param]of [['paint','paint'],['material','finish'],['view','vehicleView'],['lighting','lighting'],['intensity','lightIntensity']])if(settings[key]!==defaultVehicleSettings[key])query.set(param,settings[key]);}
