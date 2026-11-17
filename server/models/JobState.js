const mongoose = require('mongoose');

// Remembers the last period a periodic job ran for (e.g. "2026-W47"), so a
// job can't double-fire across restarts or multiple server instances: the
// claim is a single atomic conditional write.
const jobStateSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  lastRunKey: { type: String, default: null },
  lastRunAt: { type: Date, default: null },
});

// Returns true if this caller won the right to run `job` for `key`.
jobStateSchema.statics.claim = async function claim(job, key) {
  try {
    const res = await this.updateOne(
      { _id: job, lastRunKey: { $ne: key } },
      { $set: { lastRunKey: key, lastRunAt: new Date() } },
      { upsert: true }
    );
    return res.modifiedCount === 1 || res.upsertedCount === 1;
  } catch (err) {
    if (err.code === 11000) return false; // another instance upserted the same key first
    throw err;
  }
};

module.exports = mongoose.model('JobState', jobStateSchema);
