import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TopicEditor } from './TopicEditor'

function Harness({ initial = [] }: { initial?: string[] }) {
  const [topics, setTopics] = useState(initial)
  return <TopicEditor topics={topics} onChange={setTopics} />
}

describe('TopicEditor', () => {
  it('adds trimmed unique topics and stays ready for another topic', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '添加标签' }))
    const input = screen.getByRole('textbox', { name: '输入主题标签' })
    await user.type(input, '  AI教育  {Enter}AI教育{Enter}{Enter}')

    expect(screen.getAllByText('AI教育')).toHaveLength(1)
    expect(input).toHaveValue('')
  })

  it('adds a non-empty topic when the input loses focus', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '添加标签' }))
    await user.type(screen.getByRole('textbox', { name: '输入主题标签' }), '人机共育')
    await user.tab()

    expect(screen.getByText('人机共育')).toBeVisible()
    expect(screen.getByRole('button', { name: '添加标签' })).toBeVisible()
  })

  it('cancels an unfinished topic with Escape', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '添加标签' }))
    const input = screen.getByRole('textbox', { name: '输入主题标签' })
    await user.type(input, '暂不添加')
    await user.keyboard('{Escape}')

    expect(screen.queryByText('暂不添加')).toBeNull()
    expect(screen.queryByRole('textbox', { name: '输入主题标签' })).toBeNull()
    expect(screen.getByRole('button', { name: '添加标签' })).toBeVisible()
  })

  it('removes an existing topic with an accessible delete control', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['人机共育']} />)

    await user.click(screen.getByRole('button', { name: '删除主题标签：人机共育' }))

    expect(screen.queryByText('人机共育')).toBeNull()
  })
})
