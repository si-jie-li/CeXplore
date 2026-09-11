import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ImportWarnings } from './ImportWarnings'

describe('import warnings', () => {
  it('can be dismissed after import', () => {
    const view = render(<ImportWarnings warnings={['Sampling added two coverage frames.']} resetKey="dataset-1" />)
    expect(screen.getByText('Imported with 1 warning')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss import warnings' }))
    expect(screen.queryByText('Imported with 1 warning')).not.toBeInTheDocument()
    view.rerender(<ImportWarnings warnings={['A new warning.']} resetKey="dataset-2" />)
    expect(screen.getByText('Imported with 1 warning')).toBeInTheDocument()
  })
})
