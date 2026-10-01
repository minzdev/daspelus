require('dotenv').config();
const {Upt,Submission}=require('./src/models');
(async()=>{
  const upt=await Upt.findOne({where:{code:'PIP SEMARANG'}});
  const subs=await Submission.findAll({where:{uptId:upt.id}});
  console.log('all subs for PIP SEMARANG', subs.length);
  subs.forEach(s=> console.log(s.submissionId, s.status, s.month, s.year, s.locked));
  const allSubs=await Submission.findAll();
  console.log('all subs total', allSubs.length);
  allSubs.slice(0,5).forEach(s=> console.log(s.submissionId, s.uptCode, s.status));
  const {sequelize}=require('./src/models');
  await sequelize.close();
})()
