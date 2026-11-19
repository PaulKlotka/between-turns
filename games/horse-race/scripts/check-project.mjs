// Firebase lifecycle hooks supply GCLOUD_PROJECT from the selected CLI project.
const expected = 'horse-race-paul';
if (process.env.GCLOUD_PROJECT !== expected) {
  console.error(`Horse Race deployment requires dedicated project ${expected}. Selected: ${process.env.GCLOUD_PROJECT || '(none)'}.`);
  process.exit(1);
}
console.log(`Verified dedicated Horse Race deployment target: ${expected}.`);
