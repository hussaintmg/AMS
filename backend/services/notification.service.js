const { User, Notification } = require('../models');
const Log = require('../models/mongo/Log.model');

const MODULES={
  leads:{label:'Leads',link:'/leads'},customers:{label:'Customers',link:'/customers'},vehicles:{label:'Vehicles',link:'/vehicles'},parts:{label:'Parts',link:'/parts'},quotations:{label:'Quotations',link:'/sales/quotations'},bookings:{label:'Bookings',link:'/sales/bookings'},sales:{label:'Sales Orders',link:'/sales/orders'},invoices:{label:'Invoices',link:'/sales/invoices'},payments:{label:'Payments',link:'/sales/payments'},services:{label:'Services',link:'/service'},employees:{label:'Employees',link:'/hr/employees'},leaves:{label:'Leaves',link:'/hr/leaves'},expenses:{label:'Expenses',link:'/hr/expenses'}
};
const ALIASES={quotations:['quotation','quotations','sales'],bookings:['booking','bookings','sales'],sales:['order','orders','sales','sales_orders'],invoices:['invoice','invoices','sales'],customers:['customer','customers'],leads:['lead','leads']};
const strings=v=>[v?.pageKey,v?.module,v?.path].filter(Boolean).map(x=>String(x).toLowerCase());
function access(user,module,actor){
  const role=user.role||{},name=String(role.name||'').toLowerCase(); if(name==='super_admin')return true;
  const aliases=ALIASES[module]||[module]; const job=(role.jobs||[]).find(j=>strings(j).some(x=>aliases.some(a=>x.includes(a))));
  if(job){if(job.actions?.view===false)return false;const scope=job.dataScope||{};if(String(user._id)===String(actor?._id||actor))return true;if(scope.mode==='all')return true;if(scope.mode==='selected_users')return (scope.users||[]).some(x=>String(x)===String(actor?._id||actor));if(scope.mode==='selected_roles')return (scope.roles||[]).some(x=>String(x)===String(actor?.role?._id||actor?.role));return false;}
  return (role.permissions||[]).some(p=>p.canView&&p.isActive!==false&&strings(p).some(x=>aliases.some(a=>x.includes(a))));
}
async function publish({module,action='created',actor,entityId,title,message,link,metadata={}}){
  if(!MODULES[module])return;const actorUser=actor?await User.findById(actor).select('role').lean():null;
  const users=await User.find({isActive:true,_id:{$ne:actor}}).populate('role').lean();
  const docs=users.filter(u=>u.preferences?.notifications!==false&&access(u,module,actorUser)).filter(u=>u.notificationPreferences?.find(p=>p.module===module)?.enabled!==false).map(u=>({recipient:u._id,actor,module,action,entityId:String(entityId||''),title:title||`${MODULES[module].label} ${action}`,message:message||`A ${MODULES[module].label.toLowerCase()} record was ${action}.`,link:link||MODULES[module].link,metadata}));
  if(docs.length){await Notification.insertMany(docs);await Log.create({module:'notifications',action:'notifications_created',method:'POST',endpoint:'internal/notifications',user:{id:String(actor||'')},success:true,statusCode:201,metadata:{businessModule:module,action,recipients:docs.length,entityId:String(entityId||'')}});}
}
module.exports={MODULES,publish,access};
