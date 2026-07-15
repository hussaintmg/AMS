const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  recipient:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
  actor:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null},
  module:{type:String,required:true,index:true}, action:{type:String,default:'created'},
  title:{type:String,required:true}, message:{type:String,required:true}, link:{type:String,default:''},
  entityId:{type:String,default:''}, metadata:{type:mongoose.Schema.Types.Mixed,default:{}},
  isRead:{type:Boolean,default:false,index:true}, readAt:{type:Date,default:null}
},{timestamps:true});
schema.index({recipient:1,isRead:1,createdAt:-1});
module.exports=mongoose.model('Notification',schema);
