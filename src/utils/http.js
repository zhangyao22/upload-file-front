import axios from 'axios'

const instanc = axios.create({
  timeout: 15000
})

export default instanc
