import { reactive } from 'vue'
import { ObservableList } from '@live-change/dao'

class ReactiveObservableList extends ObservableList {
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

export default ReactiveObservableList
