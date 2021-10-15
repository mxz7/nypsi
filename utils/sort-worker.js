const { Worker, isMainThread, parentPort, workerData } = require("worker_threads")

if (isMainThread) {
    /**
     *
     * @param {Array<String>} array
     * @param {Map<String, Number>} members
     * @returns {Array<String>}
     */
    module.exports = function sort(array, members) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(__filename, {
                workerData: [array, members],
            })
            worker.on("message", resolve)
            worker.on("error", reject)
            worker.on("exit", (code) => {
                if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`))
            })
        })
    }
} else {
    const { inPlaceSort } = require("fast-sort")

    const arr = workerData[0]
    const members = workerData[1]

    inPlaceSort(arr).asc((i) => members.get(i))

    parentPort.postMessage(arr)
}
