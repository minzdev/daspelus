require('dotenv').config();
const {Upt, Submission, Realization, UnlockRequest} = require('./src/models');
(async()=>{
  const upt = await Upt.findOne({where:{code:'PIP SEMARANG'}});
  console.log('upt', upt.code, upt.id);
  const sid = `${upt.id}_2026_01`;
  console.log('sid', sid);
  const sub = await Submission.findByPk(sid);
  console.log('sub', sub ? sub.toJSON() : 'not found');
  if(sub){
    console.log('status', sub.status, 'locked', sub.locked);
  }
  const reals = await Realization.findAll({where:{uptId: upt.id, year: 2026, month: 1}});
  console.log('real count', reals.length, reals.map(r=> ({id:r.id.slice(0,8), locked:r.locked, programId:r.programId.slice(0,8)})));
  const unlocks = await UnlockRequest.findAll({where:{uptId: upt.id, year:2026, month:1}});
  console.log('unlocks', unlocks.map(u=> ({id:u.id.slice(0,8), status:u.status})));
  const {sequelize}=require('./src/models');
  await sequelize.close();
})()
