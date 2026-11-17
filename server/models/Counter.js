const mongoose = require('mongoose');

// Gap-free-ish monotonic sequences (e.g. the eTIMS invoice number KRA
// requires to increase by one per branch). Incremented atomically with
// $inc, so concurrent callers never receive the same value.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function next(name, options = {}) {
  const doc = await this.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, ...options }
  );
  return doc.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
