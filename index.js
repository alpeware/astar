// (c) 2024 alpeware
// Astar Safe Migration
//

const mainnetChainId = 3776
const testnetChainId = 6038361 // zKyoto

const safeL1 = '0x2D8F0c16a998f78e1DeaDfF1bE68c547929e6308'
const safeL2 = '0x3e5c63644e683549055b9be8653de26e0b4cd36e'
const safeProxyFactory = '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2'
const singleton = '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552'
const salt = 1676459867453
const initializer = '0xb63e800d00000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000f48f2b2d2a534e402487b3ee7c18c33aec0fe5e4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000041c235d48be87fdb60169291e8b64143fdfe3eaf000000000000000000000000150c2891abfe01cd2161a316192625b4a5493a4a000000000000000000000000e01a6d0300800d53350544bd1705e191d8fabc8e0000000000000000000000009a173a804864fe2d0804cc20ee32554477be8b400000000000000000000000000000000000000000000000000000000000000000'

const immutableFactory = '0x0000000000FFe8B47B3e2130213B802212439497'
const migrationContractAddress = '0xEDDf646Ff40C3E125b3353FF31e1b4Dba32417B2'

const safeUiUrl = `https://safe.astar.network/settings/setup?safe=astr:0x2D8F0c16a998f78e1DeaDfF1bE68c547929e6308`

const [abiFactory, abiProxyFactory, abiSafeProxy, abiMigration, byteCodeMigration] = await Promise.all([
  fetch('Factory.abi.json').then(e => e.json()).then(e => JSON.parse(e.result)),
  fetch('SafeProxyFactory.abi.json').then(e => e.json()),
  fetch('SafeProxy.abi.json').then(e => e.json()).then(e => JSON.parse(e.result)),
  fetch('SafeToL2Migration.abi.json').then(e => e.json()),
  fetch('SafeToL2Migration.bytecode.txt').then(e => e.text()).then(e => e.trim())
])

const fromHex = (s) => parseInt(s, 16)
const toHex = (n) => n.toString(16)

const getAccounts = async (provider) =>
    provider.send('eth_requestAccounts', [])

const getNetwork = async (provider) =>
    provider.send('eth_chainId', [])

const getSigner = async (provider) =>
    provider.getSigner()

const getSignature = async (provider, msg, from) =>
    provider.send('personal_sign', [msg, from])

const switchNetwork = async (provider, chainId) =>
    provider.send('wallet_switchEthereumChain', [{ chainId: `0x${toHex(chainId)}` }])

const createContract = (abi, bytecode, signer) =>
    new ethers.ContractFactory(abi, bytecode, signer)

const getContract = (address, abi, provider) =>
    new ethers.Contract(address, abi, provider)

const deploy = async (contract) => contract.deploy()

// setup
let provider

document.querySelector('.mm').addEventListener('click', async (e) => {
  try {
    provider = new ethers.providers.Web3Provider(window.ethereum, "any")
  } catch (ex) {
    console.error(ex)
    document.querySelector('.account').innerHTML = `Unable to detect MetaMask: <pre>${JSON.stringify(ex, null, 2)}</pre>`
    return
  }
  try {
    const accounts = await getAccounts(provider)
    await switchNetwork(provider, mainnetChainId)
    const chainId = await getNetwork(provider)
    const address = accounts[0]
    const balance = await provider.getBalance(address)
    const balanceInEth = ethers.utils.formatEther(balance)
    document.querySelector('.account').innerHTML = `Connected as <b>${accounts[0]}</b> on chain <b>${fromHex(chainId)}</b> with balance <b>${balanceInEth}</b> ETH`
    Array.from(document.querySelectorAll('button'))
        .map(e => e.disabled = false)
  } catch (ex) {
    console.error(ex)
    document.querySelector('.account').innerHTML = `Unable to connect: <pre>${JSON.stringify(ex, null, 2)}</pre>`
  }
})

document.querySelector('.deploy.safe').addEventListener('click', async (e) => {
  try {
    const signer = await getSigner(provider)
    const proxyFactory = getContract(safeProxyFactory, abiProxyFactory, signer)
    document.querySelector('.original').innerHTML = `Waiting for confirmation...`

    const tx = await proxyFactory.createProxyWithNonce(singleton, initializer, salt)
    await tx.wait()
    console.log(tx)
    const { data } = tx

    document.querySelector('.original').innerHTML = `Deployed contract to <b>${safeL1}</b>`
  } catch (ex) {
    console.error(ex)
    document.querySelector('.original').innerHTML = `Unable to deploy: <pre>${JSON.stringify(ex, null, 2)}</pre>`
  }
})

document.querySelector('.deploy.migration').addEventListener('click', async (e) => {
  try {
    const signer = await getSigner(provider)
    const factory = getContract(immutableFactory, abiFactory, signer)
    document.querySelector('.migration').innerHTML = `Waiting for confirmation...`

    const address = await factory.findCreate2Address(ethers.constants.HashZero, byteCodeMigration)
    console.log(address)

    const tx = await factory.safeCreate2(ethers.constants.HashZero, byteCodeMigration)
    await tx.wait()
    console.log(tx)
    const { data } = tx

    document.querySelector('.migration').innerHTML = `Deployed migration to <b>${address}</b>`
  } catch (ex) {
    console.error(ex)
    document.querySelector('.migration').innerHTML = `Unable to deploy: <pre>${JSON.stringify(ex, null, 2)}</pre>`
  }
})

document.querySelector('.sign').addEventListener('click', async (e) => {
  try {
    const signer = await getSigner(provider)
    const safeContract = getContract(safeL1, abiSafeProxy, provider)

    const migrationContract = getContract(migrationContractAddress, abiMigration, provider)
    const callData = migrationContract.interface.encodeFunctionData('migrateToL2', [ safeL2 ])
    console.log(callData)

    const transaction = {
      to: migrationContractAddress,
      value: 0,
      data: callData,
      operation: 1,
      safeTxGas: 0,
      baseGas: 0,
      gasPrice: 0,
      gasToken: ethers.constants.AddressZero,
      refundReceiver: ethers.constants.AddressZero,
      nonce: 0
    }
    const {
      to,
      value,
      data,
      operation,
      safeTxGas,
      baseGas,
      gasPrice,
      gasToken,
      refundReceiver,
      nonce
    } = transaction
    const transactionData = await safeContract.encodeTransactionData(
      to,
      value,
      data,
      operation,
      safeTxGas,
      baseGas,
      gasPrice,
      gasToken,
      refundReceiver,
      nonce)
    console.log(transactionData)
    document.querySelector('.data').innerHTML = `<p>Transaction data: <pre>${transactionData}</pre></p>`

    const transactionHash = await safeContract.getTransactionHash(
      to,
      value,
      data,
      operation,
      safeTxGas,
      baseGas,
      gasPrice,
      gasToken,
      refundReceiver,
      nonce)
    console.log(transactionHash)
    document.querySelector('.hash').innerHTML = `<p>Transaction hash: <pre>${transactionHash}</pre></p>`

    const from = await signer.getAddress()
    const signature = await getSignature(provider, transactionHash, from)
    console.log(signature)

    document.querySelector('.signature').innerHTML = `
      <h2>4.b. Copy Signature</h2>
      <p>Signature:</p>
      <p><textarea class="signed" cols="100" rows="10">${from}:\n${signature}</textarea></p>
      `

    document.querySelector('.signed').focus()
  } catch (ex) {
    console.error(ex)
    document.querySelector('.signature').innerHTML = `Unable to sign: <pre>${JSON.stringify(ex, null, 2)}</pre>`
  }
})

document.querySelector('.exec').addEventListener('click', async (e) => {
  try {
    const signer = await getSigner(provider)
    const safeContract = getContract(safeL1, abiSafeProxy, signer)

    const migrationContract = getContract(migrationContractAddress, abiMigration, provider)
    const callData = migrationContract.interface.encodeFunctionData('migrateToL2', [ safeL2 ])
    console.log(callData)

    const transaction = {
      to: migrationContractAddress,
      value: 0,
      data: callData,
      operation: 1,
      safeTxGas: 0,
      baseGas: 0,
      gasPrice: 0,
      gasToken: ethers.constants.AddressZero,
      refundReceiver: ethers.constants.AddressZero,
      nonce: 0
    }
    const {
      to,
      value,
      data,
      operation,
      safeTxGas,
      baseGas,
      gasPrice,
      gasToken,
      refundReceiver,
      nonce
    } = transaction
    const transactionData = await safeContract.encodeTransactionData(
      to,
      value,
      data,
      operation,
      safeTxGas,
      baseGas,
      gasPrice,
      gasToken,
      refundReceiver,
      nonce)
    console.log(transactionData)

    const transactionHash = await safeContract.getTransactionHash(
      to,
      value,
      data,
      operation,
      safeTxGas,
      baseGas,
      gasPrice,
      gasToken,
      refundReceiver,
      nonce)
    console.log(transactionHash)


    const signatures = '0x' + Array.from(document.querySelectorAll('textarea.signature'))
        .map(e => e.value)
        .filter(e => e.trim() !== '')
        .map(e => e.split(':').map(f => f.trim()))
        // adapt last byte for safe personal signatures
        .map(([a, s]) => [a, s.slice(0, -2) + (parseInt(s.slice(-2), 16) + 4).toString(16)])
        // sort by address
        .sort(([a, e], [b, f]) => a.localeCompare(b))
        .map(e => e[1].slice(2)).join('')
    console.log(signatures)

    document.querySelector('.data').innerHTML = `<p>Transaction data: <pre>${transactionData}</pre></p>`
    document.querySelector('.hash').innerHTML = `<p>Transaction hash: <pre>${transactionHash}</pre></p>`
    document.querySelector('.signatures').innerHTML = `<p>Transaction signatures: <pre>${signatures}</pre></p>`

    const check = await safeContract.checkSignatures(transactionHash, transactionData, signatures)
    console.log(check)

    const exec = await safeContract.execTransaction(
      to,
      value,
      data,
      operation,
      safeTxGas,
      baseGas,
      gasPrice,
      gasToken,
      refundReceiver,
      signatures)
    console.log(exec)

    document.querySelector('.signatures').innerHTML = `Visit your Safe UI <a target="_blank" href="${safeUiUrl}>here</a>`

  } catch (ex) {
    console.error(ex)
    document.querySelector('.signatures').innerHTML = `Error: <pre>${JSON.stringify(ex, null, 2)}</pre>`
  }
})
document.querySelector('.mm').disabled = false

Object.assign($, { provider, getSigner })
