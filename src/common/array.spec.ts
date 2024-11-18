import { chunkArray } from './array'

describe('chunkArray', () => {
  interface TestCase<T> {
    name: string
    input: T[]
    chunkSize: number
    expected: T[][]
  }

  const testCases: TestCase<number | string>[] = [
    {
      name: 'splits array into chunks of specified size',
      input: [1, 2, 3, 4, 5, 6, 7, 8],
      chunkSize: 3,
      expected: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8]
      ]
    },
    {
      name: 'handles empty array',
      input: [],
      chunkSize: 2,
      expected: []
    },
    {
      name: 'handles chunk size equal to array length',
      input: [1, 2, 3],
      chunkSize: 3,
      expected: [[1, 2, 3]]
    },
    {
      name: 'handles chunk size larger than array length',
      input: [1, 2],
      chunkSize: 3,
      expected: [[1, 2]]
    },
    {
      name: 'works with string array',
      input: ['a', 'b', 'c', 'd'],
      chunkSize: 2,
      expected: [
        ['a', 'b'],
        ['c', 'd']
      ]
    }
  ]

  it.each(testCases)('$name', ({ input, chunkSize, expected }) => {
    const result = chunkArray(input, chunkSize)
    expect(result).toEqual(expected)
  })
})
