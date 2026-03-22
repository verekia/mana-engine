import { add } from 'mana-engine'

const result = add(2, 3)
const app = document.querySelector<HTMLDivElement>('#app')
if (app) {
  app.innerHTML = `<h1>2 + 3 = ${result}</h1>`
}
