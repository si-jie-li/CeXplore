import { CellInfo } from './CellInfo'
import { DisplayControls } from './DisplayControls'
import { PlaybackControls } from './PlaybackControls'

export function ControlDeck() {
  return (
    <section className="panel control-deck">
      <PlaybackControls />
      <div className="control-lower">
        <DisplayControls />
        <CellInfo />
      </div>
    </section>
  )
}
