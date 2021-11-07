import { reactive, watch, ref, computed, onUnmounted, getCurrentInstance } from 'vue'
import * as lcdao from '@live-change/dao'

let prefix = "$reactiveDaoPath_"

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

const reactivePrefetchMixin = dao => ({
  beforeCreate() {
    if(typeof window == 'undefined') return // NO REACTIVE PREFETCH ON SERVER
    if(!this.$options.reactivePreFetch) return
    if (!this.$options.computed) this.$options.computed = {}
    this.$options.computed[prefix+"_reactivePreFetch"] = function() {
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
    let paths = this[prefix+"_reactivePreFetch"]
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

const reactiveComponent = dao => ({
  name: "Reactive",
  props: {
    what: {
      type: Object
    }
  },
  data() {
    let values = {}, errors = {}
    for(const key in this.what) {
      values[key] = undefined
      values[key + 'Error'] = undefined
    }
    return {
      values
    }
  },
  created() {
    this.observables = {}
    for(const name in this.what) {
      const what = this.what[key]
      const observable = dao.observable(what)
      this.observables[name] = observable
      observable.bindProperty(this.values[name])
      observable.bindErrorProperty(this.values[name+'Error'])
    }
  },
  beforeDestroy() {
    for(const name in this.observables) {
      const observable = this.observables[name]
      observable.unbindProperty(this, "reactivePreFetchedPaths")
      observable.unbindErrorProperty(this, "reactivePreFetchError")
    }
  },
  render(createElement) {
    return this.$scopedSlots.default(this.values)[0]
  }
})

class ReactiveObservableList extends lcdao.ObservableList {
  constructor(value, what, dispose) {
    super(value, what, dispose, (data) => {
      if(data && typeof data == 'object') {
        const activated = reactive(data)
        return activated
      }
      return data
    })
  }
}

const ReactiveDaoVue = {
  install(Vue, options) {
    if(!options || !options.dao) throw new Error("dao option required")
    const dao = options.dao

    Vue.mixin(reactiveMixin(dao))

    Vue.mixin(reactivePrefetchMixin(dao))

    Vue.component('reactive', reactiveComponent(dao))
  }
}

//// TODO: rename reactive to live
export { ReactiveDaoVue, reactiveMixin, reactivePrefetchMixin, reactiveComponent, ReactiveObservableList }

const liveSymbol = Symbol('live')

async function live(api, path, onUnmountedCb) {
  if(!onUnmounted && typeof window != 'undefined') {
    if(getCurrentInstance()) {
      onUnmountedCb = onUnmounted
    } else {
      onUnmountedCb = () => {
        console.error("live fetch outside component instance - possible memory leak")
      }
    }
  }

  if(Array.isArray(path)) path = { what: path }
  const paths = [ path ]
  if(typeof window == 'undefined') {
    const preFetchPaths = await api.get({ paths })
    console.log("PRE FETCH DATA", preFetchPaths)
    const preFetchMap = new Map(preFetchPaths.map((res) => [JSON.stringify(res.what), res] ))
    function createObject(what, more) {
      const res = preFetchMap.get(JSON.stringify(what))
      if(res.error) throw new Error(res.error)
      const data = res.data
      if(more) {
        if(Array.isArray(data)) {
          for(let i = 0; i < data.length; i ++) {
            for(const moreElement of more) {
              if(moreElement.to) {
                console.log("COLLECT POINTERS FROM", data[i], "SC", moreElement.schema)
                const pointers = lcdao.collectPointers(data[i], moreElement.schema ,
                  (what) => preFetchMap.get(JSON.stringify(what)))
                console.log("POINTERS COLLECTED", pointers)
                const values = pointers.map(pointer => createObject(pointer, moreElement.more))
                console.log("VALUES", values)
                console.log("MANY", pointers.many)
                if(pointers.many) {
                  data[i][moreElement.to] = values
                } else {
                  data[i][moreElement.to] = values[0] || null
                }
              }
            }
          }
        } else {
          for(const moreElement of more) {
            if(moreElement.to) {
              const pointers = lcdao.collectPointers(data, moreElement.schema,
                (what) => preFetchMap.get(JSON.stringify(what)))
              const values = pointers.map(pointer => createObject(pointer, moreElement.more))
              if(pointers.many) {
                data[moreElement.to] = values
              } else {
                data[moreElement.to] = values[0] || null
              }
            }
          }
        }
      }
      return data
    }
    return createObject(path.what, path.more)
  } else {
    const preFetchPaths = api.observable({ paths })
    const observables = []
    function bindResult(what, more, object, property) {
      if(!what) throw new Error("what parameter required!")
      const observable = api.observable(what)
      if(more && more.some(m => m.to)) {
        const extendedObservable = new lcdao.ExtendedObservableList(observable,
          newElement => {
            if(!newElement) return newElement
            const extendedElement = { ...newElement }
            const props = {}
            for(const moreElement of more) {
              if(moreElement.to) {
                const prop = {
                  bounds: [],
                  sources: []
                }
                props[moreElement.to] = prop
                let requiredSrcs = []
                const srcs = new Map()
                function getSource(ptr) {
                  const exists = srcs.get(ptr)
                  if(exists !== undefined) return exists.list
                  requiredSrcs.push(exists)
                  return undefined
                }
                function computePointers() {
                  while(true) {
                    const pointers = lcdao.collectPointers(newElement, moreElement.schema, getSource)
                    if(requiredSrcs.length == 0) return pointers
                    for(const requiredSrc of requiredSrcs) {
                      const observable = api.observable(requiredSrc)
                      const observer = () => {
                        bindPointers(computePointers())
                      }
                      srcs.set(JSON.stringify(requiredSrc), observable)
                      prop.sources.push({ observable, observer })
                      observable.observe(observer)
                    }
                  }
                }
                function bindPointers(pointers) {
                  if(pointers.many) {
                    const oldBound = prop.bounds.slice()
                    const newArray = new Array(pointers.length)
                    const newBounds = new Array(pointers.length)
                    for(let i = 0; i < pointers.length; i++) {
                      newBounds[i] = bindResult(pointers[i], moreElements.more, newArray, i)
                    }
                    prop.bounds = newBounds
                    oldBound.forEach(b => b.dispose())
                    extendedElement[moreElement.to] = newArray
                  } else if(pointers.length > 0) {
                    const oldBound = prop.bounds
                    if(!oldBound || oldBound.length == 0 ||
                      JSON.stringify(oldBound[0].what) != JSON.stringify(pointers[0])) {
                      if(oldBound) {
                        prop.bounds.forEach(b => b.dispose())
                      }
                      if(pointers[0]) {
                        prop.bounds = [
                          bindResult(pointers[0], moreElement.more, extendedElement, moreElement.to)
                        ]
                      }
                    }
                  }
                }
                bindPointers(computePointers())
              }
            }
            extendedElement[liveSymbol] = props
            return extendedElement
          },
          disposedElement => {
            if(!disposedElement) return
            const boundProps = disposedElement[liveSymbol]
            for(const propName in boundProps) {
              const prop = boundProps[propName]
              const propBounds = prop.bounds
              for(const propBound of propBounds) {
                console.log("PROP BOUND DISPOSE", propBound)
                propBound.dispose()
              }
              const propSources = prop.sources
              for(const propSource of propSources) {
                console.log("PROP SOURCE DISPOSE", propSource)
                propSource.observable.unobserve(propSource.observer)
              }
            }
          }
        )
        extendedObservable.bindProperty(object, property)
        return {
          what,
          property,
          dispose() {
            extendedObservable.unbindProperty(object, property)
          }
        }
      } else {
        observable.bindProperty(object, property)
        return {
          what, property,
          dispose() {
            observable.unbindProperty(object, property)
          }
        }
      }
    }
    const resultRef = ref()
    bindResult(path.what, path.more, resultRef, 'value')
    /// TODO: unobserve on unmounted
    await preFetchPaths.wait()
    return resultRef
  }
}

export { live }


export default ReactiveDaoVue
