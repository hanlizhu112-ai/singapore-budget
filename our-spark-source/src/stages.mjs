// Presentation only. Streaks continue to come from the existing cloud record.
export const FIRE_STAGES = Object.freeze([
  Object.freeze({id:'spark',day:0,label:'火花',title:'初生火花',description:'一颗小小的火种，等两个人一起照料。',particles:9}),
  Object.freeze({id:'flame',day:7,label:'火苗',title:'明亮火苗',description:'一簇暖橙色的火苗，开始有了自己的光。',particles:15}),
  Object.freeze({id:'bonfire',day:30,label:'篝火',title:'温暖篝火',description:'木柴交叠，三簇橙金火焰聚在一起。',particles:28}),
  Object.freeze({id:'blaze',day:60,label:'烈焰',title:'炽热烈焰',description:'赤红的侧焰舒展，金色火舌向上生长。',particles:42}),
  Object.freeze({id:'wildfire',day:100,label:'燎原',title:'星火燎原',description:'火焰连成一片，金白焰心照亮整片夜色。',particles:58}),
]);
export const MILESTONES = Object.freeze(FIRE_STAGES.slice(1));
export function getFireStage(streak) {
  const days = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
  return FIRE_STAGES.findLast(stage => days >= stage.day);
}
export function getNextStage(streak) {
  return MILESTONES.find(stage => stage.day > (Number.isFinite(streak) ? streak : 0)) ?? null;
}
