import { watch } from 'vue'

const prefix = "$lcDaoPath_"

const reactiveMixin = dao => ({
  data() {
    if(!this.$options.reactive) return {} // Avoid distributed fat
    let data = {}
    for (let key in this.$options.reactive) {
      data[key] = undefined
      data[key+"Error"] = undefined
    }
    return data
  },
  beforeCreate() {
    if(!this.$options.reactive) return; // Avoid distributed fat
    if (!this.$options.computed) this.$options.computed = {}
    for(let key in this.$options.reactive) {
      let path = this.$options.reactive[key]
      if(typeof path == 'function'){
        this.$options.computed[prefix + key] = path
      } else if(typeof path == 'string') {
      } else if(path.length !== undefined) {
      } else throw new Error("unknown reactive path "+path)
    }
  },
  created() {
    if(!this.$options.reactive) return; // Avoid distributed fat
    this.reactiveObservables = {}
    let reactiveObservables = this.reactiveObservables
    for(let key in this.$options.reactive) {
      let path = this.$options.reactive[key]
      if(typeof path == 'function'){
        let p = this[prefix + key]
        if(p) {
          reactiveObservables[key] = dao.observable(p)
          reactiveObservables[key].bindProperty(this, key)
          reactiveObservables[key].bindErrorProperty(this, key+"Error")
        }
        let oldPathJson
        watch(() => this[prefix + key], newPath => {
          const json = JSON.stringify(newPath)
          const match = JSON.stringify(newPath) == oldPathJson
          oldPathJson = json
          if(match) return
          if(reactiveObservables[key]) {
            this[key] = undefined
            this[key+"Error"] = undefined
            reactiveObservables[key].unbindProperty(this, key)
            reactiveObservables[key].unbindErrorProperty(this, key+"Error")
          }
          delete reactiveObservables[key]
          if(newPath) {
            reactiveObservables[key] = dao.observable(newPath)
            reactiveObservables[key].bindProperty(this, key)
            reactiveObservables[key].bindErrorProperty(this, key+"Error")
          } else {
            this[key] = undefined
          }
        })
      } else if(typeof path == 'string') {
        reactiveObservables[key] = dao.observable(path)
        reactiveObservables[key].bindProperty(this, key)
        reactiveObservables[key].bindErrorProperty(this, key+"Error")
      } else if(path.length !== undefined) {
        //console.log("DAO", dao)
        reactiveObservables[key] = dao.observable(path)
        reactiveObservables[key].bindProperty(this, key)
        reactiveObservables[key].bindErrorProperty(this, key+"Error")
      } else throw new Error("unknown reactive path "+path)
    }
  },
  beforeUnmount() {
    if(!this.$options.reactive) return; // Avoid distributed fat
    let reactiveObservables = this.reactiveObservables
    for(let key in reactiveObservables) {
      reactiveObservables[key].unbindProperty(this, key)
      reactiveObservables[key].unbindErrorProperty(this, key+"Error")
    }
  }
})

export default reactiveMixin
