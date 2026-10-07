const sequelize = require('../lib/database');
const User = require('./User');
const Upt = require('./Upt');
const Program = require('./Program');
const Target = require('./Target');
const TargetSubmission = require('./TargetSubmission');
const TargetRevision = require('./TargetRevision');
const Realization = require('./Realization');
const Submission = require('./Submission');
const UnlockRequest = require('./UnlockRequest');
const Prodi = require('./Prodi');
const AbsorptionSubmission = require('./AbsorptionSubmission');
const GradAbsorption = require('./GradAbsorption');
const Taruna = require('./Taruna');
const TarunaSubmission = require('./TarunaSubmission');
const Notification = require('./Notification');
const Diklat = require('./Diklat');
const RealizationDiklat = require('./RealizationDiklat');
const ActivityLog = require('./ActivityLog');

User.belongsTo(Upt, { foreignKey: 'uptId', as: 'upt' });
Upt.hasMany(User, { foreignKey: 'uptId', as: 'users' });

Program.belongsTo(Program, { foreignKey: 'parentId', as: 'parent' });
Program.hasMany(Program, { foreignKey: 'parentId', as: 'children' });

Target.belongsTo(Upt, { foreignKey: 'uptId', as: 'upt' });
Target.belongsTo(Program, { foreignKey: 'programId', as: 'program' });
Upt.hasMany(Target, { foreignKey: 'uptId', as: 'targets' });
Program.hasMany(Target, { foreignKey: 'programId', as: 'targets' });

TargetSubmission.belongsTo(Upt, { foreignKey: 'uptId', as: 'upt' });
Upt.hasMany(TargetSubmission, { foreignKey: 'uptId', as: 'targetSubmissions' });

TargetRevision.belongsTo(Upt, { foreignKey: 'uptId', as: 'upt' });
Upt.hasMany(TargetRevision, { foreignKey: 'uptId', as: 'targetRevisions' });

Realization.belongsTo(Upt, { foreignKey: 'uptId', as: 'upt' });
Realization.belongsTo(Program, { foreignKey: 'programId', as: 'program' });
Upt.hasMany(Realization, { foreignKey: 'uptId', as: 'realizations' });
Program.hasMany(Realization, { foreignKey: 'programId', as: 'realizations' });

Submission.belongsTo(Upt, { foreignKey: 'uptId', as: 'upt' });
Upt.hasMany(Submission, { foreignKey: 'uptId', as: 'submissions' });

UnlockRequest.belongsTo(Upt, { foreignKey: 'uptId', as: 'upt' });
Upt.hasMany(UnlockRequest, { foreignKey: 'uptId', as: 'unlockRequests' });

// Relasi Modul Penyerapan Lulusan
Upt.hasMany(Prodi, { foreignKey: 'uptId', as: 'prodis' });
Prodi.belongsTo(Upt, { foreignKey: 'uptId', as: 'upt' });

AbsorptionSubmission.belongsTo(Upt, { foreignKey: 'uptId', as: 'upt' });
Upt.hasMany(AbsorptionSubmission, { foreignKey: 'uptId', as: 'absorptionSubmissions' });

GradAbsorption.belongsTo(Upt, { foreignKey: 'uptId', as: 'upt' });
GradAbsorption.belongsTo(Prodi, { foreignKey: 'prodiId', as: 'prodi' });
GradAbsorption.belongsTo(AbsorptionSubmission, { foreignKey: 'submissionId', as: 'submission' });
AbsorptionSubmission.hasMany(GradAbsorption, { foreignKey: 'submissionId', as: 'details' });
Prodi.hasMany(GradAbsorption, { foreignKey: 'prodiId', as: 'absorptions' });

// Relasi Master Data Taruna
Upt.hasMany(Taruna, { foreignKey: 'uptId', as: 'tarunas' });
Taruna.belongsTo(Upt, { foreignKey: 'uptId', as: 'upt' });
Prodi.hasMany(Taruna, { foreignKey: 'prodiId', as: 'tarunas' });
Taruna.belongsTo(Prodi, { foreignKey: 'prodiId', as: 'prodi' });

GradAbsorption.belongsTo(Taruna, { foreignKey: 'tarunaId', as: 'taruna' });
Taruna.hasMany(GradAbsorption, { foreignKey: 'tarunaId', as: 'absorptions' });

TarunaSubmission.belongsTo(Upt, { foreignKey: 'uptId', as: 'upt' });
Upt.hasMany(TarunaSubmission, { foreignKey: 'uptId', as: 'tarunaSubmissions' });

Diklat.belongsTo(Upt, { foreignKey: 'uptId', as: 'upt' });
Upt.hasMany(Diklat, { foreignKey: 'uptId', as: 'diklats' });

RealizationDiklat.belongsTo(Upt, { foreignKey: 'uptId', as: 'upt' });
Upt.hasMany(RealizationDiklat, { foreignKey: 'uptId', as: 'realizationDiklats' });
RealizationDiklat.belongsTo(Program, { foreignKey: 'programId', as: 'program' });
RealizationDiklat.belongsTo(Diklat, { foreignKey: 'diklatId', as: 'diklat' });

const models = {
  User,
  Upt,
  Program,
  Target,
  TargetSubmission,
  TargetRevision,
  Realization,
  Submission,
  UnlockRequest,
  Prodi,
  AbsorptionSubmission,
  GradAbsorption,
  Taruna,
  TarunaSubmission,
  Notification,
  Diklat,
  RealizationDiklat,
  ActivityLog,
};

module.exports = {
  sequelize,
  models,
  User,
  Upt,
  Program,
  Target,
  TargetSubmission,
  TargetRevision,
  Realization,
  Submission,
  UnlockRequest,
  Prodi,
  AbsorptionSubmission,
  GradAbsorption,
  Taruna,
  TarunaSubmission,
  Notification,
  Diklat,
  RealizationDiklat,
  ActivityLog,
};
