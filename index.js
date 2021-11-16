import reactiveMixin from './lib/reactiveMixin.js'
import reactivePrefetchMixin from './lib/reactivePrefetchMixin.js'
import live from './lib/live.js'
import ReactiveObservableList from './lib/ReactiveObservableList.js'
import RangeBuckets from './lib/RangeBuckets.js'

const ReactiveDaoVue = {
  install(Vue, options) {
    if(!options || !options.dao) throw new Error("dao option required")
    const dao = options.dao
    Vue.mixin(reactiveMixin(dao))
    Vue.mixin(reactivePrefetchMixin(dao))
  }
}

//// TODO: rename reactive to live
export { ReactiveDaoVue, reactiveMixin, reactivePrefetchMixin, ReactiveObservableList, RangeBuckets, live }

export default ReactiveDaoVue
