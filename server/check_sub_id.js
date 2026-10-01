require('dotenv').config();
const {Upt,Submission}=require('./src/models');
(async()=>{
  const upt=await Upt.findOne({where:{code:'PIP SEMARANG'}});
  const subs=await Submission.findAll({where:{uptId:upt.id}});
  subs.forEach(s=>{
    const j=s.toJSON();
    console.log('id',j.id, 'submissionId',j.submissionId, 'status',j.status);
  });
  const {sequelize}=require('./src/models');
  await sequelize.close();
})()
