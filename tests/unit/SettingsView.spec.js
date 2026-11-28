import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import SettingsView from '@/shared/views/SettingsView.vue'
import StudyAdmin from '@/shared/models/StudyAdmin'
import {
  instantiateStudyByType,
  STUDY_TYPES,
} from '@/shared/constants/methodDefinitions'

const mockStore = {
  state: reactive({ localChanges: false, Answer: {} }),
  getters: reactive({ test: null, user: { id: 'user-1' } }),
  commit: jest.fn(),
  dispatch: jest.fn(),
}

jest.mock('vuex', () => ({
  useStore: () => mockStore,
}))

jest.mock('vue-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  onBeforeRouteLeave: jest.fn(),
}))

jest.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: { value: 'en' } }),
}))

jest.mock('@/shared/utils/toast', () => ({
  showSuccess: jest.fn(),
  showError: jest.fn(),
  showWarning: jest.fn(),
}))

jest.mock('@/shared/views/template/PageWrapper.vue', () => ({
  __esModule: true,
  default: { template: '<div><slot name="actions" /><slot /></div>' },
}))

jest.mock('@/shared/components/FormTestDescription', () => ({
  __esModule: true,
  default: {
    props: ['test'],
    emits: ['update:test'],
    template: '<div class="form-test-description" />',
  },
}))

const testAdmin = new StudyAdmin({ userDocId: 'user-1', email: 'a@b.c' })

const mountWithSavedStudy = async (testType, data) => {
  let savedStudy = {
    id: 'study-1',
    ...instantiateStudyByType(testType, { testAdmin, ...data }).toFirestore(),
  }

  mockStore.commit.mockImplementation((type, value) => {
    if (type === 'SET_TEST') mockStore.getters.test = value
    if (type === 'SET_LOCAL_CHANGES') mockStore.state.localChanges = value
  })
  mockStore.dispatch.mockImplementation(async (action, payload) => {
    if (action === 'getStudy') {
      const study = instantiateStudyByType(savedStudy.testType, savedStudy)
      mockStore.commit('SET_TEST', study)
      return study
    }
    if (action === 'updateStudy') {
      savedStudy = { id: payload.id, ...payload.toFirestore() }
      mockStore.commit('SET_TEST', payload)
    }
  })

  const wrapper = mount(SettingsView, {
    props: { id: 'study-1' },
    global: {
      mocks: { $t: (key) => key },
      stubs: {
        Snackbar: true,
        LeaveAlert: true,
        AccessNotAllowed: true,
        'v-btn': {
          template:
            '<button class="v-btn" @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  })
  await flushPromises()

  return { wrapper, getSavedStudy: () => savedStudy }
}

const editAndSave = async (wrapper, testTitle, testDescription) => {
  const form = wrapper.findComponent('.form-test-description')
  form.vm.$emit('update:test', {
    ...form.props('test'),
    testTitle,
    testDescription,
  })
  await flushPromises()
  await wrapper.find('.v-btn').trigger('click')
  await flushPromises()
}

it.each([
  STUDY_TYPES.ACCESSIBILITY_MANUAL,
  STUDY_TYPES.ACCESSIBILITY_AUTOMATIC,
])('saves a new title and description for %s studies', async (testType) => {
  const { wrapper, getSavedStudy } = await mountWithSavedStudy(testType, {
    title: 'Old audit',
    description: 'Old description',
  })
  await editAndSave(wrapper, 'New audit', 'New description')

  expect(getSavedStudy()).toMatchObject({
    title: 'New audit',
    testTitle: 'New audit',
    description: 'New description',
  })
  expect(
    wrapper.findComponent('.form-test-description').props('test'),
  ).toMatchObject({
    testTitle: 'New audit',
    testDescription: 'New description',
  })
})

it('keeps saving the title and description of heuristic studies', async () => {
  const { wrapper, getSavedStudy } = await mountWithSavedStudy(
    STUDY_TYPES.HEURISTIC,
    { testTitle: 'Old heuristics', testDescription: 'Old description' },
  )
  await editAndSave(wrapper, 'New heuristics', 'New description')

  expect(getSavedStudy()).toMatchObject({
    testTitle: 'New heuristics',
    testDescription: 'New description',
  })
  expect(getSavedStudy()).not.toHaveProperty('title')
})
