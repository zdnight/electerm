import { createRef } from 'react'
import RdpSession from '../rdp/rdp-session'
import { createTerm } from '../terminal/terminal-apis'
import deepCopy from 'json-deep-copy'
import clone from '../../common/to-simple-obj'
import { handleErr } from '../../common/fetch'
import {
  statusMap
} from '../../common/constants'
import {
  Spin,
  message,
  Modal,
  Tag
} from 'antd'
import * as ls from '../../common/safe-local-storage'
import { copy } from '../../common/clipboard'
import resolutions from '../rdp/resolutions'
import RFB from '@novnc/novnc/core/rfb'
import VncForm from './vnc-form'

const e = window.translate

export default class VncSession extends RdpSession {
  constructor (props) {
    const id = `vnc-reso-${props.tab.host}`
    const resObj = ls.getItemJSON(id, resolutions[0])
    super(props)
    this.state = {
      types: [],
      showConfirm: false,
      loading: false,
      aspectRatio: 4 / 3,
      name: '',
      ...resObj
    }
  }

  domRef = createRef()

  componentDidMount () {
    this.remoteInit()
  }

  componentWillUnmount () {
    this.rfb && this.rfb.disconnect()
    delete this.rfb
  }

  // computeProps = () => {
  //   const {
  //     height,
  //     width,
  //     tabsHeight,
  //     leftSidebarWidth,
  //     pinned,
  //     openedSideBar
  //   } = this.props
  //   return {
  //     width: width - (pinned && openedSideBar ? leftSidebarWidth : 0),
  //     height: height - tabsHeight
  //   }
  // }

  remoteInit = async (term = this.term) => {
    this.setState({
      loading: true
    })
    const { config } = this.props
    const {
      host,
      tokenElecterm,
      server = ''
    } = config
    const { id } = this.props
    const tab = window.store.applyProfile(deepCopy(this.props.tab || {}))
    const {
      type,
      term: terminalType,
      viewOnly = false,
      scaleViewport = true,
      username,
      password
    } = tab
    const opts = clone({
      term: terminalType || config.terminalType,
      tabId: id,
      uid: tab.id,
      srcTabId: tab.id,
      termType: type,
      ...tab
    })
    const r = await createTerm(opts)
      .catch(err => {
        const text = err.message
        handleErr({ message: text })
      })
    this.setState({
      loading: false
    })
    if (!r) {
      this.setStatus(statusMap.error)
      return
    }
    this.setStatus(statusMap.success)
    const { pid, port } = r
    this.pid = pid
    this.port = port
    const hs = server
      ? server.replace(/https?:\/\//, '')
      : `${host}:${port}`
    const pre = server.startsWith('https') ? 'wss' : 'ws'
    const { width, height } = this.state
    const wsUrl = `${pre}://${hs}/vnc/${pid}?token=${tokenElecterm}&width=${width}&height=${height}`
    const vncOpts = {
      scaleViewport,
      viewOnly,
      style: {
        width: width + 'px',
        height: height + 'px',
        overflow: 'scroll'
      },
      credentials: {}
    }
    if (username) {
      vncOpts.credentials.username = username
    }
    if (password) {
      vncOpts.credentials.password = password
    }
    const rfb = new RFB(
      this.getDom(),
      wsUrl,
      vncOpts
    )
    const events = [
      'connect',
      'disconnect',
      'credentialsrequired',
      'securityfailure',
      'clipboard',
      'bell',
      'desktopname',
      'capabilities'
    ]
    for (const event of events) {
      rfb.addEventListener(event, this[`on${window.capitalizeFirstLetter(event)}`])
    }
    this.rfb = rfb
  }

  onConnect = (event) => {
    this.setStatus(statusMap.success)
    this.setState({
      loading: false
    })
  }

  onDisconnect = () => {
    this.setStatus(statusMap.error)
  }

  onSecurityfailure = (event) => {
    message.error('Security Failure: ' + event.detail?.reason)
  }

  onOk = (res) => {
    this.setState({
      showConfirm: false
    })
    this.rfb?.sendCredentials(res)
  }

  onCredentialsrequired = (event) => {
    this.setState({
      types: event.detail?.types || [],
      showConfirm: true
    })
  }

  renderForm (types = this.state.types) {
    return (
      <VncForm
        types={types}
        handleFinish={this.onOk}
      />
    )
  }

  onClipboard = (event) => {
    copy(event.detail.text)
  }

  onBell = (event) => {
    message.warning('Bell')
  }

  onDesktopname = (event) => {
    this.setState({
      name: event?.detail?.name || ''
    })
  }

  onCapabilities = (capabilities) => {
    console.log('onCapabilities', capabilities)
  }

  getDom = () => {
    return this.domRef.current
  }

  handleReInit = () => {
    this.rfb?.disconnect()
    delete this.rfb
    this.remoteInit()
  }

  renderInfo () {
    const {
      name
    } = this.state
    const {
      host,
      port,
      username
    } = this.props.tab
    return (
      <span className='mg2l mg2r'>
        <b>{name}</b> {username}@{host}:{port}
      </span>
    )
  }

  renderHelp = () => {
    return (
      <Tag color='red' className='mg1l'>Beta</Tag>
    )
  }

  renderConfirm () {
    const {
      showConfirm
    } = this.state
    if (!showConfirm) {
      return null
    }
    const confirmProps = {
      title: e('credentialsRequired'),
      content: this.renderForm(['password']),
      footer: null,
      visible: true
    }
    return (
      <Modal
        {...confirmProps}
      >
        {this.renderForm()}
      </Modal>
    )
  }

  render () {
    const { width: w, height: h } = this.props
    const vncProps = {
      style: {
        width: w + 'px',
        height: h + 'px'
      }
    }
    const { width, height, loading } = this.state
    const divProps = {
      style: {
        width: width + 'px',
        height: height + 'px'
      }
    }
    return (
      <Spin spinning={loading}>
        <div
          {...vncProps}
          className='rdp-session-wrap pd1'
        >
          {this.renderControl()}
          <div
            {...divProps}
            className='vnc-session-wrap session-v-wrap'
            ref={this.domRef}
          />
          {this.renderConfirm()}
        </div>
      </Spin>
    )
  }
}
