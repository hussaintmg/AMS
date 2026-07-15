const windows=new Map();
module.exports=(req,res,next)=>{const key=String(req.user?.id||req.ip||'anonymous'),now=Date.now(),current=windows.get(key);if(!current||now-current.startedAt>=60000){windows.set(key,{startedAt:now,count:1});return next()}if(current.count>=90)return res.status(429).json({success:false,message:'Search rate limit exceeded. Try again shortly.'});current.count+=1;next()};
