const mongoose=require('mongoose');
const schema=new mongoose.Schema({entityType:{type:String,required:true,index:true},entityId:{type:String,required:true},title:{type:String,default:''},subtitle:{type:String,default:''},searchableText:{type:String,default:''},url:{type:String,default:''},metadata:{type:mongoose.Schema.Types.Mixed,default:{}},isActive:{type:Boolean,default:true,index:true},createdAt:{type:Date,default:Date.now},updatedAt:{type:Date,default:Date.now}},{timestamps:false});
schema.index({entityType:1,entityId:1},{unique:true});schema.index({searchableText:'text',title:'text',subtitle:'text'});schema.index({updatedAt:-1});
module.exports=mongoose.model('SearchDocument',schema);
