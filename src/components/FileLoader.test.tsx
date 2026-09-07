import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useExplorerStore } from '../state/explorerStore'
import { FileLoader } from './FileLoader'

const first = `cell_name,frame,AP,LR,VD
AB,1,0,0,0
`
const second = `cell_name,frame,AP,LR,VD
AB,1,2,0,0
`

beforeEach(() => useExplorerStore.getState().clearDataset())

describe('multi-file import flow', () => {
  it('maps files sequentially and imports each no-ID file as a separate embryo', async () => {
    const { container } = render(<FileLoader />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [
      new File([first], 'first.csv', { type: 'text/csv' }),
      new File([second], 'second.csv', { type: 'text/csv' }),
    ] } })

    expect(await screen.findByText(/file 1 of 2/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load & continue' }))
    expect(await screen.findByText(/file 2 of 2/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load selected' }))

    await waitFor(() => expect(useExplorerStore.getState().dataset?.embryos).toHaveLength(2))
    const dataset = useExplorerStore.getState().dataset!
    expect(dataset.sources).toHaveLength(2)
    expect(dataset.frameIndex.get(1)).toHaveLength(2)
    expect(dataset.embryos.map((embryo) => embryo.label)).toEqual(['first', 'second'])
  })

  it('lists embryo IDs from one file and imports every checked embryo', async () => {
    const csv = `cell_name,frame,AP,LR,VD,embryo_id
AB,1,0,0,0,emb_1
AB,1,2,0,0,emb_2
`
    const { container } = render(<FileLoader />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File([csv], 'multi.csv', { type: 'text/csv' })] } })

    const secondEmbryo = await screen.findByRole('checkbox', { name: 'emb_2' })
    fireEvent.click(secondEmbryo)
    fireEvent.click(screen.getByRole('button', { name: 'Load selected' }))

    await waitFor(() => expect(useExplorerStore.getState().dataset?.embryos).toHaveLength(2))
    expect(useExplorerStore.getState().dataset?.frameIndex.get(1)).toHaveLength(2)
  })
})
