self.importScripts('spark-md5.min.js')

self.onmessage = e => {
  // 接受主线程传递的数据
  const { chunks } = e.data

  const spark = new self.SparkMD5.ArrayBuffer()

  const loadNext = (index) => {
    const reader = new FileReader()
    reader.readAsArrayBuffer(chunks[index].file)
    reader.onload = e => {
      spark.append(e.target.result)
      if (index >= chunks.length - 1) {
        self.postMessage({
          progress: 100,
          hash: spark.end()
        })
      } else {
        self.postMessage({
          progress: ((index / chunks.length) *100).toFixed(2)
        })
        loadNext(++index)
      }
    }
  }
  loadNext(0)
}