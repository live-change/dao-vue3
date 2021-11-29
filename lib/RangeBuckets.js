import live from "./live.js"
import { computed, reactive, ref, unref, watch } from "vue"

class Bucket {

  constructor(id, api, range, pathFunction, bucketSize, waitForComponents, hardClose) {
    this.id = id
    this.api = () => api
    this.range = reactive(range)
    this.pathFunction = pathFunction
    this.bucketSize = bucketSize
    this.waitForComponents = waitForComponents
    this.hardClose = hardClose

    this.disposed = false
    this.onDispose = []
    this.domElements = []

    this.data = computed(() => {
      const ldv = this.liveData.value
      if(!ldv) return []
      let source = unref(ldv)
      if(this.range.reverse) {
        source = source.slice()
        source.reverse()
      }
      if(this.hardClose) {
        return source
      }
      return source.filter(element => (
        (!this.range.gt  || element.id >  this.range.gt ) &&
        (!this.range.gte || element.id >= this.range.gte) &&
        (!this.range.lt  || element.id <  this.range.lt ) &&
        (!this.range.lte || element.id <= this.range.lte)
      ))
    })
    this.liveData = ref(null)

    this.load()

    this.promise = waitForComponents ? this.createPromise() : this.dataPromise
  }

  createPromise() {
    const promise = new Promise((r1, r2) => { this.resolve = r1; this.reject = r2 })
  }

  async load() {
    this.path = this.pathFunction(this.range)
    this.dataPromise = live(this.api(), this.path, fun => onDispose.push(fun))
    this.dataPromise.then(data => {
      this.liveData.value = data
    })
    return this.dataPromise
  }

  isTopClosed() {
    return !!(this.range && (this.range.gt || this.range.gte))
  }

  isBottomClosed() {
    return !!(this.range && (this.range.lt || this.range.lte))
  }

  canClose() {
    const data = unref(this.data)
    return data && data.length == this.bucketSize
  }

  async closeTop() {
    const data = unref(await this.dataPromise)
    if(!this.data) throw new Error("can't close - bucket not loaded!")
    if(this.data.length < this.bucketSize) throw new Error("can't close - bucket not full")
    this.range.gte = data[this.range.reverse ? data.length - 1 : 0].id
    if(this.hardClose) await this.load()
  }

  async closeBottom() {
    const data = unref(await this.dataPromise)
    if(data.length < this.bucketSize) throw new Error("can't close - bucket not full")
    this.range.lte = data[this.range.reverse ? 0 : data.length - 1].id
    if(this.hardClose) await this.load()
  }

  dispose() {
    this.disposed = true
    for(const disposeFunction of this.onDispose) {
      disposeFunction()
    }
  }
}

class RangeBuckets {
  constructor(api, pathFunction, options) {
    this.api = api
    this.pathFunction = pathFunction
    this.bucketSize = options?.bucketSize || 3
    this.position = options?.position
    this.softClose = options?.softClose
    this.waitForComponents = options?.waitForComponents

    this.lastBucketId = 0
    this.buckets = reactive([])

    this.canLoadTop = computed(() => this.isTopLoadPossible())
    this.canLoadBottom = computed(() => this.isBottomLoadPossible())

    this.loadFirstBucket()
  }

  isTopLoadPossible() {
    if(this.buckets.length == 0) return false
    const firstBucket = this.buckets[0]
    return firstBucket.isTopClosed() || firstBucket.canClose()
  }

  isBottomLoadPossible() {
    if(this.buckets.length == 0) return false
    const lastBucket = this.buckets[this.buckets.length - 1]
    return lastBucket.isBottomClosed() || lastBucket.canClose()
  }

  loadFirstBucket() {
    const firstBucket = this.createBucket({
      gte: this.position,
      limit: this.bucketSize
    })
    this.buckets.push(firstBucket)
  }

  createBucket(range) {
    return new Bucket(++this.lastBucketId, this.api, range, this.pathFunction,
      this.bucketSize, this.waitForComponents, !this.softClose)
  }

  async wait() {
    //console.log("WAIT FOR BUCKETS", this.buckets.length)
    await Promise.all(this.buckets.map(bucket => bucket.promise)).then(loaded => this)
  }

  async loadTop() {
    //console.log("LOAD TOP!", this.isTopLoadPossible())
    if(this.buckets.length == 0) return this.loadFirstBucket()
    const firstBucket = this.buckets[0]
    await firstBucket.promise
    if(!this.isTopLoadPossible()) return
    if(firstBucket != this.buckets[0]) {
      return this.buckets[0].promise
    }
    let range = { limit: this.bucketSize, reverse: true }
    if(!firstBucket.isTopClosed()) {
      if(firstBucket.canClose()) {
        await firstBucket.closeTop()
        if(!firstBucket.isTopClosed()) throw new Error('top not closed!!!')
        if(!this.isTopLoadPossible()) return
        return this.loadTop()
      } else {
        console.log("FBD", unref(firstBucket.data))
        throw new Error('impossible to read before bucket that is not closeable')
      }
    }
    if(firstBucket.range.gte) {
      range.lt = firstBucket.range.gte
    } else if(firstBucket.range.gt) {
      range.lte = firstBucket.range.gt
    } else {
      throw new Error('imposible to read before bucket '+ JSON.stringify(firstBucket.range))
    }
    const bucket = this.createBucket(range)
    this.buckets.unshift(bucket)
    return bucket.promise
  }

  async loadBottom() {
    //console.log("LOAD BOTTOM!", this.isBottomLoadPossible())
    if(this.buckets.length == 0) return this.loadFirstBucket()
    const lastBucket = this.buckets[this.buckets.length - 1]
    await lastBucket.promise
    if(!this.isBottomLoadPossible()) return
    if(lastBucket != this.buckets[this.buckets.length - 1]) {
      return this.buckets[this.buckets.length - 1].promise
    }
    let range = { limit: this.bucketSize }
    if(!lastBucket.isBottomClosed()) {
      if(lastBucket.canClose()) {
        await lastBucket.closeBottom()
        if(!lastBucket.isBottomClosed()) throw new Error('bottom not closed!!!')
        if(!this.isBottomLoadPossible()) return
        return this.loadBottom()
      } else {
        throw new Error('impossible to read after bucket that is not closeable')
      }
    }
    if(lastBucket.range.lte) {
      range.gt = lastBucket.range.lte
    } else if(lastBucket.range.lt) {
      range.lte = lastBucket.range.lt
    } else {
      throw new Error('imposible to read after bucket '+ JSON.stringify(lastBucket.range))
    }
    const bucket = this.createBucket(range)
    this.buckets.push(bucket)
    return bucket.promise
  }

  dropTop() {
    if(this.buckets.length == 0) throw new Error('impossible to drop from empty')
    //console.log("DROP TOP!")
    const droppedBucket = this.buckets[0]
    const height = droppedBucket.domElements.reduce((acc, el) => acc + (el?.offsetHeight || 0), 0)
    //console.log("DOM ELEMENTS", droppedBucket.domElements.map(el => el?.offsetHeight || 0), height)
    this.buckets.shift()
    droppedBucket.dispose()
    return height
  }

  dropBottom() {
    //console.log("DROP BOTTOM!")
    if(this.buckets.length == 0) throw new Error('impossible to drop from empty')
    const droppedBucket = this.buckets[this.buckets.length - 1]
    const height = droppedBucket.domElements.reduce((acc, el) => acc + el?.offsetHeight, 0)
    this.buckets.pop()
    droppedBucket.dispose()
    return height
  }

  dispose() {
    for(const bucket of this.buckets) {
      bucket.dispose()
    }
    this.buckets = []
  }

}

export default RangeBuckets
