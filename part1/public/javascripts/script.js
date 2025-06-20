const { createApp } = Vue;

createApp({
  data() {
    return {
      dogImage: ''
    };
  },
  methods: {
    async reloadDog() {
      try {
        