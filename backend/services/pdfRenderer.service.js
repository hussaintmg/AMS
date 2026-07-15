const path = require('path');
const { Worker } = require('worker_threads');

function renderPdf(pages, data, title) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'pdfWorker.cjs'), { workerData: { pages, data, title } });
    worker.once('message', (message) => message.success ? resolve(Buffer.from(message.buffer)) : reject(new Error(message.error)));
    worker.once('error', reject);
    worker.once('exit', (code) => { if (code !== 0) reject(new Error(`PDF worker exited with code ${code}`)); });
  });
}

module.exports = { renderPdf };
