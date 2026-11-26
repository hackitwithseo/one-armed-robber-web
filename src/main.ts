import './style.css'
import { Game } from './game/Game'

const host = document.getElementById('app')
if (!host) throw new Error('Missing #app host')

// eslint-disable-next-line no-new
new Game(host)
