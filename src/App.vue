<template>
  <div class="drag" ref="drag">
    <input type="file" name="file" ref="file" @change="chooseFile">
  </div>
  <div @click="uploadChunks">上传文件</div>
  {{ progress }}%
  <hr>
  {{ hashProgress }}%  {{ hash }}
</template>

<script>
import { uploadFile } from './utils/ali-oss'
import sparkMD5 from 'spark-md5'

export const CHUNK_SIZE = 0.5 * 1024 * 1024 // 切割的大小

export default {
  name: 'App',
  components: {
  },
  data () {
    return {
      file: null,
      chunks: [],
      progress: 0,
      hashProgress: 0,
      hash: ''
    }
  },
  mounted () {
    const drag = this.$refs.drag
    if (drag) {
      drag.addEventListener('dragover', (e) => {
        drag.style.borderColor = 'red'
        e.preventDefault()
      })
      drag.addEventListener('dragleave', (e) => {
        drag.style.borderColor = '#ccc'
        e.preventDefault()
      })
      drag.addEventListener('drop', (e) => {
        drag.style.borderColor = '#ccc'
        this.file = e.dataTransfer.files[0]
        e.preventDefault()
      })
    }
  },
  methods: {
    // js-spark-md5
    createFileChunk (file, size = CHUNK_SIZE) {
      // 切割
      const chunks = []
      let cur = 0
      while (cur < file.size) {
        chunks.push({ index: cur, file: file.slice(cur, cur + size) })
        cur += size
      }
      this.chunks = chunks
      return chunks
    },
    async calculateHashWork (chunks) {
      // 计算md5
      return new Promise(resolve => {
        // 由于 Worker 不能读取本地文件，所以这个脚本必须来自网络
        const worker = new Worker('/hash.js')
        worker.postMessage({ chunks })
        worker.onmessage = e => {
          const { hash, progress } = e.data
          this.hashProgress = progress
          if (hash) {
            resolve(hash)
          }
        }
      })
    },
    async calculateHashIdle () {
      return new Promise(resolve => {
        const spark = new sparkMD5.ArrayBuffer()

        const appendToSpark = async file => {
          return new Promise(resolve => {
            const reader = new FileReader()
            reader.readAsArrayBuffer(file)
            reader.onload = e => {
              spark.append(e.target.result)
              resolve()
            }
          })
        }

        let index = 0
        const workLoop = async deadline => {
          // timeRemaining获取当前帧的剩余时间
          while (index < this.chunks.length && deadline.timeRemaining() > 1) {
            // 空闲时间且有任务
            await appendToSpark(this.chunks[index].file)
            if (index < this.chunks.length - 1) {
              this.hashProgress = ((index / this.chunks.length) * 100).toFixed(2)
            } else {
              this.hashProgress = 100
              resolve(spark.end())
            }
            index++
          }
          if (index < this.chunks.length) {
            requestIdleCallback(workLoop)
          }
        }
        // 浏览器一旦空闲，就会调用workLoop
        requestIdleCallback(workLoop)
      })
    },
    async uploadFile () {
      // 判断是否图片，看需求
      // const isImg = this.isImage(this.file)
      // if (!isImg) {
      //   alert('请选择图片')
      //   return
      // }
      // const form = new FormData()
      // form.append('name', 'file')
      // form.append('file', this.file)
      // http.post('/api/upload/v1/uploadSingle', form, {
      //   onUploadProgress: (axiosProgressEvent) => {
      //     /*
      //       {
      //         loaded: number;
      //         total?: number;
      //         progress?: number; // in range [0..1]
      //         bytes: number; // how many bytes have been transferred since the last trigger (delta)
      //         estimated?: number; // estimated time in seconds
      //         rate?: number; // upload speed in bytes
      //         upload: true; // upload sign
      //       }
      //     */
      //     this.progress = (axiosProgressEvent.progress * 100).toFixed(2)
      //   }
      // })
    },
    async uploadChunks () {
      const chunks = this.createFileChunk(this.file)
      const hash = await this.calculateHashWork(chunks)
      this.hash = hash
      // const hash1 = await this.calculateHashIdle()
      const extension = this.file.name.substring(this.file.name.lastIndexOf('.'))
      const fileName = this.hash + extension
      const res = await uploadFile(fileName, this.file)
      console.log(res)
      // TODO 请求接口将url发送到后端

      // this.chunks = this.chunks.map((chunk, index) => {
      //   return {
      //     hash,
      //     name: hash + '-' + index,
      //     index,
      //     chunk: chunk.file
      //   }
      // })

      // const requests = this.chunks.map(chunk => {
      //   const form = new FormData()
      //   // form.append('name', 'file')
      //   // form.append('file', this.file)
      //   console.log('-=-=-=-=-=', chunk.chunk)
      //   form.append('chunk', chunk.chunk)
      //   form.append('hash', chunk.hash)
      //   form.append('name', chunk.name)
      //   return form
      // }).map((form, index) => {
      //   http.post('/api/upload/v1/uploadSingle', form, {
      //     onUploadProgress: (axiosProgressEvent) => {
      //       this.chunks[index].progress = (axiosProgressEvent.progress * 100).toFixed(2)
      //     }
      //   })
      // })

      // // TODO 并发量控制
      // await Promise.all(requests).then(res => {
      //   console.log('-=-=-=-=-=-==-', res)
      // })
    },
    chooseFile (e) {
      this.file = e.target.files[0]
    },
    async isImage () {
      const type = this.file.type
      if (type.startsWith('image')) {
        // 二进制 查看文件类型
        let length = 6
        if (type === 'image/jpeg' || type === 'image/jpg') {
          length = 3
        } else if (type === 'image/gif') {
          length = 4
        } else if (type === 'image/png') {
          length = 8
        } else if (type === 'image/bmp') {
          // ?
          length = 2
        }
        const res = await this.blobToString(this.file.slice(0, length))
        if (res === 'FFD8FF') {
          // jpge
          return true
        } else if (res === '89504E47DA1AA') {
          // png
          return true
        } else if (res === '47494638') {
          // gif
          return true
        }

        return false
      }
    },
    blobToString (file) {
      return new Promise(resolve => {
        const fileRead = new FileReader()
        fileRead.onload = () => {
          const res = fileRead.result.split('').map(v => v.charCodeAt(0)).map(v => v.toString(16).toUpperCase()).join('')
          resolve(res)
        }
        fileRead.readAsBinaryString(file)
      })
    }
  }
}
</script>

<style>
.drag {
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #ccc;
}
</style>
