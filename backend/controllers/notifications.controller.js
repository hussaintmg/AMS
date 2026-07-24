const {User,Notification}=require('../models');
const {MODULES,access}=require('../services/notification.service');
const uid=req=>req.user?.id||req.user?._id;
/**
 * Modules the user may currently be notified about: permitted by their role and
 * not switched off in their preferences. Permissions are re-checked on read, so
 * revoking access also hides notifications already stored for that module.
 */
const allowedModules=async(userId)=>{
  const user=await User.findById(userId).populate('role').lean();
  if(!user)return{user:null,modules:[]};
  if(user.preferences?.notifications===false)return{user,modules:[]};
  const disabled=new Set((user.notificationPreferences||[]).filter(p=>p.enabled===false).map(p=>p.module));
  const modules=Object.keys(MODULES).filter(key=>!disabled.has(key)&&access(user,key,user));
  return{user,modules};
};

exports.list=async(req,res,next)=>{try{
  const limit=Math.min(Number(req.query.limit)||20,100);
  const {modules}=await allowedModules(uid(req));
  if(!modules.length)return res.json({success:true,data:{items:[],unread:0}});
  const filter={recipient:uid(req),module:{$in:modules}};
  const items=await Notification.find(filter).sort({createdAt:-1}).limit(limit).lean();
  const unread=await Notification.countDocuments({...filter,isRead:false});
  res.json({success:true,data:{items,unread}});
}catch(e){next(e)}};
exports.markRead=async(req,res,next)=>{try{await Notification.updateOne({_id:req.params.id,recipient:uid(req)},{$set:{isRead:true,readAt:new Date()}});res.json({success:true})}catch(e){next(e)}};
exports.markAllRead=async(req,res,next)=>{try{
  const {modules}=await allowedModules(uid(req));
  await Notification.updateMany({recipient:uid(req),module:{$in:modules},isRead:false},{$set:{isRead:true,readAt:new Date()}});
  res.json({success:true});
}catch(e){next(e)}};
exports.preferences=async(req,res,next)=>{try{const user=await User.findById(uid(req)).populate('role').lean();const current=Object.fromEntries((user.notificationPreferences||[]).map(p=>[p.module,p.enabled]));const modules=Object.entries(MODULES).filter(([key])=>access(user,key,user)).map(([key,v])=>({key,label:v.label,enabled:current[key]!==false}));res.json({success:true,data:{modules,masterEnabled:user.preferences?.notifications!==false}})}catch(e){next(e)}};
exports.savePreferences=async(req,res,next)=>{try{const user=await User.findById(uid(req)).populate('role');const allowed=Object.keys(MODULES).filter(key=>access(user.toObject(),key,user));const preferences=(req.body.modules||[]).filter(p=>allowed.includes(p.module)).map(p=>({module:p.module,enabled:p.enabled!==false}));user.notificationPreferences=preferences;user.preferences={...(user.preferences?.toObject?.()||user.preferences||{}),notifications:req.body.masterEnabled!==false};await user.save();res.json({success:true,message:'Notification preferences saved'})}catch(e){next(e)}};
