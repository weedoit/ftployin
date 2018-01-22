Vue.component('code-editor', {
    props: ['code', 'placeholder'],
    computed: {
        rows: {
            get: function () {
                return (this.code || '').split('\n').map((c, i) => i + 1);
            }
        },
        source: {
            get: function () {
                return this.code;
            },

            set: function (code) {
                this.code = code;
                this.$emit('update', code);
            }
        }
    },
    template: `
        <div class="ui code-editor">
            <div class="editor-wrapper">
                <div class="row-numbers">
                    <span class="number" v-for="row in rows">{{ row }}</span>
                </div>
                <div class="editor">
                    <textarea v-model="source" :placeholder="placeholder"></textarea>
                </div>
            </div>
        </div>
    `
});