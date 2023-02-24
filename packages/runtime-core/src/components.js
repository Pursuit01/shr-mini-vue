import { effect } from "../../reactive/src/effect";
// TODOS: 还需引入 reactive, patch, shallowReactive,

function mountComponent(vnode, container, anchor) {
  // 获取组件实例对象
  const componentOption = vnode.type;

  // 从组件实例中解构出 render 渲染函数, data对象, 生命周期钩子（这里假设每个钩子上只注册了一个回调）
  const {
    render,
    data,
    beforeCreate,
    created,
    beforeMount,
    mounted,
    beforeUpdate,
    updated,
    props: propsOption,
  } = componentOption;

  // 先调用 beforeCreate 钩子
  beforeCreate && beforeCreate();

  // 调用data()函数并使用reactive处理，获取响应式对象state
  const state = reactive(data());
  // 解析props和attrs
  const [props, attrs] = resolveProps(propsOption, vnode.props);

  // 定义一个组件实例，一个组件实际上就是一个对象，它包含了与组件相关的状态信息
  const instance = {
    state,
    isMounted: false, // 是否挂载
    subTree: null, // 子树
    props: shallowReactive(props), // 组件props，浅响应
  };

  // 在vnode上添加针对组件实例的引用
  vnode.component = instance;

  // 创建一个渲染上下文对象，本质是对组件实例的代理
  // 它的意义在于拦截数据状态的读取和设置操作，每当在渲染函数或生命周期钩子中通过 this 来读取数据时，都会优先从组件的自身状态中读取，
  // 如果组件本身并没有对应的数据，则再从 props 数据中读取。
  const renderContext = new Proxy(instance, {
    get(t, k, r) {
      const { state, props } = t;
      if (state && k in state) {
        return Reflect.get(state, k);
      } else if (props && k in props) {
        return Reflect.get(props, k);
      } else {
        console.log("属性不存在");
      }
    },
    set(t, k, v, r) {
      const { state, props } = t;
      if (state && k in state) {
        state[k] = v;
      } else if (props && k in props) {
        console.warn(`子组件无法修改父组件的props ${k}`);
      } else {
        console.log("属性不存在");
      }
    },
  });

  created && created.call(renderContext);

  // 将组件的render函数放入副作用函数中，这样一旦state变化了，就会重新执行组件的渲染函数，并重新挂载（patch方法）
  effect(
    () => {
      // 将执行render函数，并将this指向state，同时把state作为第一个参数传递到render函数中
      const subTree = render.call(renderContext, state);

      // 如果组件未挂载，调用patch第一个参数传null
      if (!instance.isMounted) {
        // 执行生命周期钩子
        beforeMount && beforeMount.call(renderContext);

        patch(null, subTree, container, anchor);

        // 执行mounted
        mounted && mounted.call(renderContext);

        // 将组件状态更新为已挂载
        instance.isMounted = true;
      } else {
        beforeUpdate && beforeUpdate.call(renderContext);
        // 如果已挂载，对比旧子树 instance.subTree 与新子树 subTree,进行打补丁操作
        patch(instance.subTree, subTree, container, anchor);
        updated && updated.call(renderContext);
      }

      // 更新组件实例的子树
      instance.subTree = subTree;
    },
    {
      // 确保多次修改相应是数据时，只执行一次副作用函数。
      scheduler: queueJob,
    }
  );
}

const queue = new Set();
const p = Promise.resolve();
let isFlushing = false;
function queueJob(job) {
  queue.add(job);
  if (!isFlushing) {
    isFlushing = true;
    p.then(() => {
      try {
        queue.forEach((job) => job());
      } finally {
        isFlushing = false;
        queue.clear = 0;
      }
    });
  }
}
/**
 * 判断 propsData 的 key 是否存在于 propsOption 上，存在则属于 props ，不存在则是 attrs
 * @param {*} propsOption 组件内声明的props选项
 * @param {*} propsData 组件实例上传递的props数据
 * @returns [props, attrs]
 */
function resolveProps(propsOption, propsData) {
  const props = {};
  const attrs = {};
  for (const key in propsData) {
    if (key in propsOption) {
      props[key] = propsData[key];
    } else {
      attrs[key] = propsData[key];
    }
  }
  return [props, attrs];
}
