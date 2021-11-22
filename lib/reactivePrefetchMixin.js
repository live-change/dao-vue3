import { watch } from 'vue'

let prefix = "$lcDaoPath_"

const reactivePrefetchMixin = dao => ({
  beforeCreate() {
    if(typeof window == 'undefined') return // NO REACTIVE PREFETCH ON SERVER
    if(!this.$options.reactivePreFetch) return
    if (!this.$options.computed) this.$options.computed = {}
    this.$options.computed[prefix + "_reactivePreFetch"] = function() {
      return this.$options.reactivePreFetch.call(this, this.$route, this.$router)
    }
    const optionData = this.$options.data
    this.$options.data = function vueReactiveDaoInjectedDataFn () {
      const data = (
          (typeof optionData === 'function')
              ? optionData.call(this)
              : optionData
      ) || {}
      data.reactivePreFetchedPaths = []
      data.reactivePreFetchError = null
      return data
    }
  },
  created() {
    if(typeof window == 'undefined') return // NO REACTIVE PREFETCH ON SERVER
    if(!this.$options.reactivePreFetch) return
    let paths = this[prefix + "_reactivePreFetch"]
    if(paths) {
      this.reactivePreFetchObservable = dao.observable({ paths })
      this.reactivePreFetchObservable.bindProperty(this, "reactivePreFetchedPaths")
      this.reactivePreFetchObservable.bindErrorProperty(this, "reactivePreFetchError")
    }
    watch(() => this[prefix + "_reactivePreFetch"], paths => {
      if(this.reactivePreFetchObservable) {
        this.reactivePreFetchObservable.unbindProperty(this, "reactivePreFetchedPaths")
        this.reactivePreFetchObservable.unbindErrorProperty(this, "reactivePreFetchError")
      }
      delete this.reactivePreFetchObservable
      if(paths) {
        this.reactivePreFetchObservable = dao.observable({ paths })
        this.reactivePreFetchObservable.bindProperty(this, "reactivePreFetchedPaths")
        this.reactivePreFetchObservable.bindErrorProperty(this, "reactivePreFetchError")
      }
    })
  },
  beforeUnmount() {
    if(typeof window == 'undefined') return; // NO REACTIVE PREFETCH ON SERVER
    if(!this.$options.reactivePreFetch) return; // Avoid distributed fat
    if(this.reactivePreFetchObservable) {
      this.reactivePreFetchObservable.unbindProperty(this, "reactivePreFetchedPaths")
      this.reactivePreFetchObservable.unbindErrorProperty(this, "reactivePreFetchError")
    }
  }
})

export default reactivePrefetchMixin
