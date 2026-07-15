const mongoose = require('mongoose');
const schema = new mongoose.Schema({ key:{type:String,required:true,trim:true}, label:{type:String,default:''}, documentType:{type:String,enum:['quotation','booking','order','invoice'],required:true,index:true}, category:{type:String,default:'custom'} },{timestamps:true});
schema.index({documentType:1,key:1},{unique:true});
module.exports = mongoose.model('PdfVariable', schema);
