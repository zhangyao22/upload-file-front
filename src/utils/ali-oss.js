import { UPLOAD_FILE_OBJECT_NAME_DIR } from '../config/index'
const OSS = require('ali-oss')

const client = new OSS({
  region: 'oss-cn-hangzhou',
  accessKeyId: '',
  accessKeySecret: '',
  bucket: 'multi-part-upload'
})

const progress = (p, _checkpoint) => {
  // Object的上传进度。
  // 分片上传的断点信息。
}

const headers = {
  // 指定Object的存储类型。
  // 'x-oss-storage-class': 'Standard'
  // 指定Object标签，可同时设置多个标签。
  // 'x-oss-tagging': 'Tag1=1&Tag2=2',
  // 指定初始化分片上传时是否覆盖同名Object。此处设置为true，表示禁止覆盖同名Object。
  // 'x-oss-forbid-overwrite': 'true'
}

// 查看完全上传成功之后的信息
export const head = async (fileName) => {
  return client.head(`${UPLOAD_FILE_OBJECT_NAME_DIR}/${fileName}`)
}

// 上传文件
export const uploadFile = async (fileName, file) => {
  const listUploadsResult = await listUploads()
  const currentUploadOssPartInfo = listUploadsResult.uploads.find(upload => {
    const name = upload.name.substring(upload.name.lastIndexOf('/') + 1)
    return name === fileName
  })
  if (currentUploadOssPartInfo) {
    // 断点续传
    // 分片上传的 uploadId name
    const checkpoint = await listParts(fileName, currentUploadOssPartInfo.uploadId)
    return await resumeUpload(fileName, file, checkpoint)
  } else {
    // 完整上传文件
    return await multipartUpload(fileName, file)
  }
}

/**
 * oss 分片上传
 * @param {*} fileName 上传文件名扩展名,Object完整路径，Object完整路径中不能包含Bucket名称
 * @param {*} file 表示文件路径或者HTML5文件
 */
export const multipartUpload = async (fileName, file) => {
  try {
    // 依次填写Object完整路径（例如exampledir/exampleobject.txt）和本地文件的完整路径（例如D:\\localpath\\examplefile.txt）。Object完整路径中不能包含Bucket名称。
    // 如果本地文件的完整路径中未指定本地路径（例如examplefile.txt），则默认从示例程序所属项目对应本地路径中上传文件。
    const result = client.multipartUpload(`${UPLOAD_FILE_OBJECT_NAME_DIR}/${fileName}`, file, {
      progress
      // headers
      // 指定meta参数，自定义Object的元信息。通过head接口可以获取到Object的meta数据。
      // meta: {
      //   year: 2020,
      //   people: 'test'
      // }
    })
    return result
    // 填写Object完整路径，例如exampledir/exampleobject.txt。Object完整路径中不能包含Bucket名称。
    // const head = await client.head(`${UPLOAD_FILE_OBJECT_NAME_DIR}/${fileName}`)
    // console.log(head)
  } catch (e) {
    // 捕获超时异常。
    if (e.code === 'ConnectionTimeoutError') {
      // do ConnectionTimeoutError operation 重试机制
    }
  }
}

export const resumeUpload = async (fileName, file, checkpoint) => {
  const doneParts = []
  checkpoint.parts.forEach(item => {
    doneParts.push({ etag: item.ETag, number: Number(item.PartNumber) })
  })
  let result = null
  // 重试五次。
  for (let i = 0; i < 5; i++) {
    try {
      result = client.multipartUpload(`${UPLOAD_FILE_OBJECT_NAME_DIR}/${fileName}`, file, {
        checkpoint: {
          doneParts,
          file,
          fileSize: file.size,
          name: checkpoint.name,
          partSize: Number(checkpoint.parts[0].Size),
          uploadId: checkpoint.uploadId
        }
        // async progress (percentage, cpt) { checkpoint = cpt }
      })
      break
      // 跳出当前循环。
    } catch (e) {
    }
  }
  return result
}

// 取消分片上传事件
export const abortMultipartUpload = async (fileName, uploadId) => {
  return client.abortMultipartUpload(`${UPLOAD_FILE_OBJECT_NAME_DIR}/${fileName}`, uploadId)
}

// 列举分片上传事件
export const listUploads = async (query = {}) => {
  // query中支持设置prefix、marker、delimiter、upload-id-marker和max-uploads参数。
  return client.listUploads(query)
}

// 简单列举已上传的分片,数量小于等于1000时
export const listParts = async (fileName, uploadId) => {
  const query = {
    // 指定此次返回的最大分片（Part）个数。max-parts参数的默认值和最大值均为1000。
    'max-parts': 1000
  }
  // 依次填写Object完整路径（例如exampledir/exampleobject.txt）和uploadId。Object完整路径中不能包含Bucket名称。
  return client.listParts(`${UPLOAD_FILE_OBJECT_NAME_DIR}/${fileName}`, uploadId, query)
}

// 当分片数量大于1000时，请使用以下代码列举所有已上传的分片
export const listAllParts = async (fileName, uploadId) => {
  const query = {
    // 指定此次返回的最大分片（Part）个数。max-parts参数的默认值和最大值均为1000。
    'max-parts': 1000
  }
  let result
  do {
    // 依次填写Object完整路径（例如exampledir/exampleobject.txt）和uploadId。Object完整路径中不能包含Bucket名称。
    result = await client.listParts(`${UPLOAD_FILE_OBJECT_NAME_DIR}/${fileName}`, uploadId, query)
    // 指定列举分片的起始位置，例如2。只有分片号大于此参数值的分片会被列举。
    query['2'] = result.nextPartNumberMarker
    result.parts.forEach(part => {
    })
  } while (result.isTruncated === 'true')
}
