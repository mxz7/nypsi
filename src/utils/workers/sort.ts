import { Worker, isMainThread, parentPort, workerData } from "worker_threads"

declare function require(name: string)

export default function workerSort(array: Array<string>, members: Map<string, number>): Promise<Array<string>> {
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

if (isMainThread) {
    const { inPlaceSort } = require("fast-sort")

    const arr = workerData[0]
    const members = workerData[1]

    inPlaceSort(arr).asc((i) => members.get(i))

    parentPort.postMessage(arr)
}
