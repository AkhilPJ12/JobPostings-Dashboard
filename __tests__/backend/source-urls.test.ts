import { validSourceUrl } from '../../lib/modules/ingestion/urls'

describe('source URL validation', () => {
  it('ignores placeholder secondary URLs from company records', () => {
    expect(validSourceUrl('NA')).toBeNull()
    expect(validSourceUrl('')).toBeNull()
    expect(validSourceUrl(null)).toBeNull()
  })

  it('accepts only absolute HTTP or HTTPS URLs', () => {
    expect(validSourceUrl(' https://careers.example.com/jobs?sort=date '))
      .toBe('https://careers.example.com/jobs?sort=date')
    expect(validSourceUrl('/jobs')).toBeNull()
    expect(validSourceUrl('javascript:alert(1)')).toBeNull()
  })
})
